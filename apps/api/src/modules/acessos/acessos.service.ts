import { Injectable, Logger } from '@nestjs/common';
import { AcessoEvento } from '@prisma/client';
import type { AcessoQuery } from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** Período assumido quando a consulta não informa datas. */
const DIAS_PADRAO = 30;

/**
 * Sessão sem renovar o token por mais que isto é dada como abandonada na
 * coluna "Ativa" — o refresh acontece a cada ~15 min, então o dobro disso
 * (mais folga) indica navegador fechado, não pausa para o café.
 */
const MINUTOS_SESSAO_VIVA = 40;

const SORT_FIELDS_EVENTO = new Set(['criadoEm', 'evento', 'email']);
const SORT_FIELDS_SESSAO = new Set(['iniciadaEm', 'ultimaAtividadeEm']);

/** Eventos que representam acesso negado — o filtro "somente sem sucesso". */
const EVENTOS_FALHA: AcessoEvento[] = [
  AcessoEvento.login_falha,
  AcessoEvento.login_bloqueado,
  AcessoEvento.login_fora_horario,
  AcessoEvento.acesso_fora_horario,
];

interface RegistroAcesso {
  evento: AcessoEvento;
  email: string;
  usuarioId?: string | null;
  empresaId?: string | null;
  detalhe?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AcessosService {
  private readonly logger = new Logger(AcessosService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grava um evento de acesso. Auditoria nunca derruba a operação que a
   * originou: falha aqui vira log de servidor, não erro para o usuário — o
   * contrário deixaria o sistema inteiro fora do ar por um problema de
   * escrita no rastro.
   */
  async registrar(dados: RegistroAcesso) {
    try {
      await this.prisma.acessoLog.create({
        data: {
          evento: dados.evento,
          email: dados.email.toLowerCase(),
          usuarioId: dados.usuarioId ?? null,
          empresaId: dados.empresaId ?? null,
          detalhe: dados.detalhe ?? null,
          ip: dados.ip ?? null,
          // User agent completo é longo e não acrescenta nada depois disso.
          userAgent: dados.userAgent?.slice(0, 300) ?? null,
        },
      });
    } catch (erro) {
      this.logger.error(
        `Falha ao registrar acesso (${dados.evento}, ${dados.email})`,
        erro instanceof Error ? erro.stack : String(erro),
      );
    }
  }

  // ------------------------------------------------------------------ sessões

  /**
   * Abre a sessão no login. O id volta para o AuthService gravar no refresh
   * token emitido — é o fio que liga as renovações seguintes a esta mesma
   * sessão (ver `RefreshToken.sessaoId`).
   */
  async abrirSessao(dados: {
    usuarioId: string;
    empresaId: string;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    const sessao = await this.prisma.sessao.create({
      data: {
        usuarioId: dados.usuarioId,
        empresaId: dados.empresaId,
        ip: dados.ip ?? null,
        userAgent: dados.userAgent?.slice(0, 300) ?? null,
      },
      select: { id: true },
    });
    return sessao.id;
  }

  /**
   * Marca atividade na sessão (renovação de token, troca de empresa). É o que
   * faz o tempo de uso crescer enquanto o usuário está trabalhando.
   */
  async tocarSessao(sessaoId: string, empresaId?: string) {
    await this.prisma.sessao.updateMany({
      where: { id: sessaoId, encerradaEm: null },
      data: {
        ultimaAtividadeEm: new Date(),
        ...(empresaId ? { empresaId } : {}),
      },
    });
  }

  /** Fecha a sessão (logout, ou corte por fim de expediente). */
  async encerrarSessao(sessaoId: string, motivo: string) {
    await this.prisma.sessao.updateMany({
      where: { id: sessaoId, encerradaEm: null },
      data: { encerradaEm: new Date(), motivoFim: motivo },
    });
  }

  /**
   * Encerra todas as sessões abertas de um usuário — usado quando o acesso é
   * cortado por horário: os refresh tokens dele também são revogados, então a
   * sessão não tem como continuar e ficaria "aberta" para sempre no relatório.
   */
  async encerrarSessoesDoUsuario(usuarioId: string, motivo: string) {
    await this.prisma.sessao.updateMany({
      where: { usuarioId, encerradaEm: null },
      data: { encerradaEm: new Date(), motivoFim: motivo },
    });
  }

  // ---------------------------------------------------------------- consultas

  private periodo(query: AcessoQuery) {
    const fim = query.dataFim ?? new Date();
    const inicio =
      query.dataInicio ??
      new Date(fim.getTime() - DIAS_PADRAO * 24 * 60 * 60 * 1000);
    return { inicio, fim };
  }

  /**
   * Usuários com vínculo ativo na empresa consultada. É o corte de tenant
   * destas telas: `acessos_log`/`sessoes` não têm RLS (são escritos no login,
   * antes de existir empresa ativa — ver a migration), então o isolamento é
   * feito aqui, restringindo a consulta a quem pertence à empresa.
   */
  private async usuariosDaEmpresa(empresaId: string) {
    const vinculos = await this.prisma.withTenant(empresaId, (tx) =>
      tx.usuarioEmpresa.findMany({
        where: { empresaId, ativo: true },
        select: { usuarioId: true },
      }),
    );
    return vinculos.map((v) => v.usuarioId);
  }

  /**
   * Filtro base dos eventos: sempre restrito aos usuários da empresa.
   *
   * Tentativa com e-mail que não existe no cadastro (`usuarioId` nulo) não
   * pertence a empresa nenhuma — some da consulta de um admin comum e só
   * aparece para o perfil de sistema (`isAdmin`), que administra a
   * plataforma inteira. Sem isso, o admin da empresa A leria os e-mails
   * tentados contra a empresa B.
   */
  private async whereEventos(
    empresaId: string,
    user: AuthenticatedUser,
    query: AcessoQuery,
  ) {
    const { inicio, fim } = this.periodo(query);
    const usuarioIds = await this.usuariosDaEmpresa(empresaId);
    const doEscopo = query.usuarioId
      ? usuarioIds.filter((id) => id === query.usuarioId)
      : usuarioIds;

    return {
      criadoEm: { gte: inicio, lte: fim },
      // Evento específico manda; "somente sem sucesso" é o atalho de quem não
      // escolheu um evento.
      ...(query.evento ? { evento: query.evento } : {}),
      ...(!query.evento && query.somenteFalhas
        ? { evento: { in: EVENTOS_FALHA } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { ip: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      AND: [
        {
          OR: [
            { usuarioId: { in: doEscopo } },
            ...(user.isAdmin && !query.usuarioId ? [{ usuarioId: null }] : []),
          ],
        },
      ],
    };
  }

  /** Lista paginada de eventos de acesso (a aba "Eventos" da tela). */
  async listarEventos(
    empresaId: string,
    user: AuthenticatedUser,
    query: AcessoQuery,
  ) {
    const where = await this.whereEventos(empresaId, user, query);
    const sortField =
      query.sortBy && SORT_FIELDS_EVENTO.has(query.sortBy)
        ? query.sortBy
        : 'criadoEm';
    const sortOrder = query.sortBy ? query.sortOrder : 'desc';

    const [linhas, total] = await Promise.all([
      this.prisma.acessoLog.findMany({
        where,
        ...paginationToSkipTake(query),
        orderBy: { [sortField]: sortOrder },
        include: { usuario: { select: { nome: true } } },
      }),
      this.prisma.acessoLog.count({ where }),
    ]);

    const data = linhas.map(({ usuario, ...log }) => ({
      ...log,
      usuarioNome: usuario?.nome ?? null,
    }));
    return buildPaginatedResult(data, total, query);
  }

  private duracaoMinutos(sessao: {
    iniciadaEm: Date;
    ultimaAtividadeEm: Date;
    encerradaEm: Date | null;
  }) {
    const fim = sessao.encerradaEm ?? sessao.ultimaAtividadeEm;
    const minutos = (fim.getTime() - sessao.iniciadaEm.getTime()) / 60_000;
    return Math.round(Math.max(0, minutos) * 100) / 100;
  }

  private sessaoAtiva(sessao: {
    encerradaEm: Date | null;
    ultimaAtividadeEm: Date;
  }) {
    return (
      !sessao.encerradaEm &&
      Date.now() - sessao.ultimaAtividadeEm.getTime() <
        MINUTOS_SESSAO_VIVA * 60_000
    );
  }

  private async whereSessoes(empresaId: string, query: AcessoQuery) {
    const { inicio, fim } = this.periodo(query);
    const usuarioIds = await this.usuariosDaEmpresa(empresaId);
    const doEscopo = query.usuarioId
      ? usuarioIds.filter((id) => id === query.usuarioId)
      : usuarioIds;

    return {
      // A sessão entra no período pela data em que começou — é assim que o
      // total de tempo do dia bate com os logins daquele dia.
      iniciadaEm: { gte: inicio, lte: fim },
      usuarioId: { in: doEscopo },
      ...(query.search
        ? {
            usuario: {
              OR: [
                { nome: { contains: query.search, mode: 'insensitive' as const } },
                { email: { contains: query.search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };
  }

  /** Lista paginada de sessões com o tempo de uso apurado (aba "Sessões"). */
  async listarSessoes(empresaId: string, query: AcessoQuery) {
    const where = await this.whereSessoes(empresaId, query);
    const sortField =
      query.sortBy && SORT_FIELDS_SESSAO.has(query.sortBy)
        ? query.sortBy
        : 'iniciadaEm';
    const sortOrder = query.sortBy ? query.sortOrder : 'desc';

    const [linhas, total] = await Promise.all([
      this.prisma.sessao.findMany({
        where,
        ...paginationToSkipTake(query),
        orderBy: { [sortField]: sortOrder },
        include: { usuario: { select: { nome: true, email: true } } },
      }),
      this.prisma.sessao.count({ where }),
    ]);

    const data = linhas.map(({ usuario, ...sessao }) => ({
      ...sessao,
      usuarioNome: usuario.nome,
      email: usuario.email,
      duracaoMinutos: this.duracaoMinutos(sessao),
      ativa: this.sessaoAtiva(sessao),
    }));
    return buildPaginatedResult(data, total, query);
  }

  /**
   * Números do período: cartões do topo da tela e o tempo de uso por usuário.
   *
   * O agregado é feito em memória sobre as sessões do período (não em SQL)
   * porque a duração depende de `encerradaEm ?? ultimaAtividadeEm`, e o volume
   * é pequeno — uma empresa gera algumas centenas de sessões por mês.
   */
  async resumo(empresaId: string, user: AuthenticatedUser, query: AcessoQuery) {
    // Os cartões contam tudo do período: os filtros de evento/somente-falhas
    // são da listagem, e aplicá-los aqui faria o total contradizer a aba.
    const [whereSessoes, whereEventos] = await Promise.all([
      this.whereSessoes(empresaId, query),
      this.whereEventos(empresaId, user, {
        ...query,
        somenteFalhas: false,
        evento: undefined,
      }),
    ]);

    const [sessoes, eventos] = await Promise.all([
      this.prisma.sessao.findMany({
        where: whereSessoes,
        include: { usuario: { select: { nome: true, email: true } } },
      }),
      this.prisma.acessoLog.findMany({
        where: whereEventos,
        select: {
          usuarioId: true,
          evento: true,
          criadoEm: true,
          usuario: { select: { nome: true, email: true } },
        },
      }),
    ]);

    const porUsuario = new Map<
      string,
      {
        usuarioId: string;
        usuarioNome: string;
        email: string;
        sessoes: number;
        minutosTotal: number;
        minutosMedio: number;
        ultimoAcesso: Date | null;
        tentativasFalha: number;
      }
    >();

    for (const sessao of sessoes) {
      const atual = porUsuario.get(sessao.usuarioId) ?? {
        usuarioId: sessao.usuarioId,
        usuarioNome: sessao.usuario.nome,
        email: sessao.usuario.email,
        sessoes: 0,
        minutosTotal: 0,
        minutosMedio: 0,
        ultimoAcesso: null as Date | null,
        tentativasFalha: 0,
      };
      atual.sessoes += 1;
      atual.minutosTotal += this.duracaoMinutos(sessao);
      if (!atual.ultimoAcesso || sessao.iniciadaEm > atual.ultimoAcesso) {
        atual.ultimoAcesso = sessao.iniciadaEm;
      }
      porUsuario.set(sessao.usuarioId, atual);
    }

    // Quem só acessou conta como "usuário que acessou"; quem só tentou, não.
    // Por isso o número sai daqui, antes das linhas de tentativa entrarem.
    const usuariosDistintos = porUsuario.size;

    for (const evento of eventos) {
      if (!evento.usuarioId || !EVENTOS_FALHA.includes(evento.evento)) continue;
      // Quem tentou e nunca entrou no período não tem sessão, logo não está no
      // mapa — e é exatamente a linha que interessa ver. Nasce aqui, zerada.
      const atual = porUsuario.get(evento.usuarioId) ?? {
        usuarioId: evento.usuarioId,
        usuarioNome: evento.usuario?.nome ?? '—',
        email: evento.usuario?.email ?? '',
        sessoes: 0,
        minutosTotal: 0,
        minutosMedio: 0,
        ultimoAcesso: null as Date | null,
        tentativasFalha: 0,
      };
      atual.tentativasFalha += 1;
      porUsuario.set(evento.usuarioId, atual);
    }

    const minutosTotal = sessoes.reduce(
      (soma, s) => soma + this.duracaoMinutos(s),
      0,
    );
    const arredondar = (n: number) => Math.round(n * 100) / 100;

    return {
      loginsSucesso: eventos.filter((e) => e.evento === 'login_sucesso').length,
      tentativasFalha: eventos.filter((e) => EVENTOS_FALHA.includes(e.evento)).length,
      usuariosDistintos,
      sessoesAbertas: sessoes.filter((s) => this.sessaoAtiva(s)).length,
      minutosTotal: arredondar(minutosTotal),
      minutosMedioPorSessao: arredondar(
        sessoes.length ? minutosTotal / sessoes.length : 0,
      ),
      porUsuario: [...porUsuario.values()]
        .map((u) => ({
          ...u,
          minutosTotal: arredondar(u.minutosTotal),
          minutosMedio: arredondar(u.sessoes ? u.minutosTotal / u.sessoes : 0),
          ultimoAcesso: u.ultimoAcesso,
        }))
        .sort((a, b) => b.minutosTotal - a.minutosTotal),
    };
  }
}

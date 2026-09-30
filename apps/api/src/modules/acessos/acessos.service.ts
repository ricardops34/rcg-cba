import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MOTIVO_DESCONECTADO } from '../../common/sessao/sessao-encerrada.exception';
import { HORARIO_TIMEZONE } from '../../common/horario/horario-trabalho';
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
    this.situacaoCache.delete(sessaoId);
  }

  /**
   * Situação da sessão para o JwtAuthGuard, que pergunta a cada requisição.
   * Cache curto por sessão: o suficiente para uma tela que dispara várias
   * consultas juntas não virar várias leituras, e curto o bastante para quem
   * foi desconectado sair em segundos. Encerrar pela API limpa o cache na hora.
   */
  private readonly situacaoCache = new Map<string, { aberta: boolean; motivo: string | null; ate: number }>();
  private static readonly CACHE_SESSAO_MS = 10_000;

  async situacaoSessao(sessaoId: string): Promise<{ aberta: boolean; motivo: string | null }> {
    const cache = this.situacaoCache.get(sessaoId);
    if (cache && cache.ate > Date.now()) return cache;
    const sessao = await this.prisma.sessao.findUnique({
      where: { id: sessaoId },
      select: { encerradaEm: true, motivoFim: true },
    });
    // Sessão que não existe mais conta como encerrada: o token não tem onde se apoiar.
    const situacao = { aberta: !!sessao && !sessao.encerradaEm, motivo: sessao?.motivoFim ?? null };
    if (this.situacaoCache.size > 10_000) this.situacaoCache.clear();
    this.situacaoCache.set(sessaoId, { ...situacao, ate: Date.now() + AcessosService.CACHE_SESSAO_MS });
    return situacao;
  }

  /**
   * Encerra sessões abertas e revoga os refresh tokens delas — sem isto a outra
   * ponta renovaria o token e seguiria logada. `manter` é a sessão que fica
   * (a do login que acabou de acontecer).
   */
  async encerrarSessoes(
    filtro: { usuarioId: string; manter?: string; sessaoId?: string },
    motivo: string,
  ) {
    const abertas = await this.prisma.sessao.findMany({
      where: {
        usuarioId: filtro.usuarioId,
        encerradaEm: null,
        ...(filtro.sessaoId ? { id: filtro.sessaoId } : {}),
        ...(filtro.manter ? { NOT: { id: filtro.manter } } : {}),
      },
      select: { id: true, empresaId: true },
    });
    if (abertas.length === 0) return [];
    const ids = abertas.map((s) => s.id);
    const agora = new Date();
    await this.prisma.$transaction([
      this.prisma.sessao.updateMany({
        where: { id: { in: ids }, encerradaEm: null },
        data: { encerradaEm: agora, motivoFim: motivo },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessaoId: { in: ids }, revokedAt: null },
        data: { revokedAt: agora },
      }),
    ]);
    for (const id of ids) this.situacaoCache.delete(id);
    return abertas;
  }

  // ------------------------------------------------------------ uso por rotina

  /**
   * Rota do menu → rotina. Catálogo muda raramente (sincronizar-catalogo), então
   * fica em memória por alguns minutos em vez de uma leitura por tela aberta.
   */
  private mapaRotas: { ate: number; itens: { rota: string; rotinaId: string }[] } | null = null;

  private async rotinasPorRota() {
    if (this.mapaRotas && this.mapaRotas.ate > Date.now()) return this.mapaRotas.itens;
    const menus = await this.prisma.menu.findMany({
      where: { rota: { not: null }, deletedAt: null },
      select: {
        nome: true,
        rota: true,
        rotinas: {
          where: { deletedAt: null },
          select: { id: true, codigo: true, nome: true },
          orderBy: { codigo: 'asc' },
        },
      },
    });
    // Menu com mais de uma rotina (Empresas + Base de Demonstração, Orçamentos
    // + Comissão...): a tela é a da rotina de mesmo nome do menu; senão a cujo
    // código aparece na rota; senão a primeira.
    const principal = (m: (typeof menus)[number]) =>
      m.rotinas.find((r) => r.nome === m.nome) ??
      m.rotinas.find((r) => m.rota!.split('/').includes(r.codigo)) ??
      m.rotinas[0];
    const itens = menus
      .filter((m) => m.rota && m.rotinas.length > 0)
      .map((m) => ({ rota: m.rota!.replace(/\/+$/, ''), rotinaId: principal(m).id }))
      // Prefixo mais longo primeiro: /comercial/produtos/fichas antes de /comercial/produtos.
      .sort((a, b) => b.rota.length - a.rota.length);
    this.mapaRotas = { ate: Date.now() + 5 * 60_000, itens };
    return itens;
  }

  /**
   * Conta a abertura de uma tela. O web manda o caminho; a rotina sai da rota
   * do menu (prefixo mais longo — `/comercial/produtos/123` conta em Produtos).
   * Caminho que não é tela do sistema é ignorado, sem erro: isto é medição, não
   * pode derrubar a navegação.
   */
  async registrarUso(empresaId: string, usuarioId: string, caminho: string) {
    const limpo = caminho.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    const alvo = (await this.rotinasPorRota()).find(
      (r) => limpo === r.rota || limpo.startsWith(`${r.rota}/`),
    );
    if (!alvo) return { registrado: false };
    const agora = new Date();
    const dia = new Date(
      `${new Intl.DateTimeFormat('en-CA', { timeZone: HORARIO_TIMEZONE }).format(agora)}T00:00:00.000Z`,
    );
    await this.prisma.withTenant(empresaId, (tx) =>
      tx.usoRotina.upsert({
        where: {
          empresaId_usuarioId_rotinaId_dia: { empresaId, usuarioId, rotinaId: alvo.rotinaId, dia },
        },
        create: { empresaId, usuarioId, rotinaId: alvo.rotinaId, dia, acessos: 1, ultimoAcessoEm: agora },
        update: { acessos: { increment: 1 }, ultimoAcessoEm: agora },
      }),
    );
    return { registrado: true };
  }

  /**
   * Rotinas mais usadas no período: acessos, usuários distintos e último
   * acesso. Mesmo corte das demais consultas da tela — usuários com acesso à
   * empresa — e o filtro de usuário da tela.
   */
  async usoPorRotina(empresaId: string, query: AcessoQuery) {
    const { inicio, fim } = this.periodo(query);
    const usuarios = await this.usuariosDaEmpresa(empresaId);
    const linhas = await this.prisma.withTenant(empresaId, (tx) =>
      tx.usoRotina.findMany({
        where: {
          empresaId,
          usuarioId: query.usuarioId ? query.usuarioId : { in: usuarios },
          dia: {
            gte: new Date(`${inicio.toISOString().slice(0, 10)}T00:00:00.000Z`),
            lte: new Date(`${fim.toISOString().slice(0, 10)}T00:00:00.000Z`),
          },
        },
        select: {
          usuarioId: true,
          acessos: true,
          ultimoAcessoEm: true,
          rotina: {
            select: {
              id: true,
              codigo: true,
              nome: true,
              menu: { select: { modulo: { select: { nome: true } } } },
            },
          },
        },
      }),
    );

    const porRotina = new Map<
      string,
      { rotinaId: string; rotinaCodigo: string; rotinaNome: string; moduloNome: string | null;
        acessos: number; usuarios: Set<string>; ultimoAcessoEm: Date }
    >();
    for (const l of linhas) {
      const atual = porRotina.get(l.rotina.id) ?? {
        rotinaId: l.rotina.id,
        rotinaCodigo: l.rotina.codigo,
        rotinaNome: l.rotina.nome,
        moduloNome: l.rotina.menu?.modulo?.nome ?? null,
        acessos: 0,
        usuarios: new Set<string>(),
        ultimoAcessoEm: l.ultimoAcessoEm,
      };
      atual.acessos += l.acessos;
      atual.usuarios.add(l.usuarioId);
      if (l.ultimoAcessoEm > atual.ultimoAcessoEm) atual.ultimoAcessoEm = l.ultimoAcessoEm;
      porRotina.set(l.rotina.id, atual);
    }
    return {
      data: [...porRotina.values()]
        .map(({ usuarios: u, ultimoAcessoEm, ...r }) => ({
          ...r,
          usuarios: u.size,
          ultimoAcessoEm: ultimoAcessoEm.toISOString(),
        }))
        .sort((a, b) => b.acessos - a.acessos),
    };
  }

  /**
   * Desconecta uma sessão pela tela de Acessos. Só alcança sessão de usuário
   * com acesso à empresa ativa — o mesmo corte das consultas desta tela
   * (`sessoes` não tem RLS). A pessoa sai na próxima requisição
   * (JwtAuthGuard) e não consegue renovar. A própria sessão atual fica de
   * fora: para isso existe o "Sair".
   */
  async desconectar(empresaId: string, ator: AuthenticatedUser, sessaoId: string) {
    if (ator.sessaoId && ator.sessaoId === sessaoId) {
      throw new BadRequestException('Esta é a sua sessão atual. Para encerrá-la, use "Sair".');
    }
    const usuarios = await this.usuariosDaEmpresa(empresaId);
    const sessao = await this.prisma.sessao.findFirst({
      where: { id: sessaoId, usuarioId: { in: usuarios } },
      select: { id: true, usuarioId: true, encerradaEm: true, usuario: { select: { email: true } } },
    });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');
    if (sessao.encerradaEm) return { success: true, jaEncerrada: true };

    await this.encerrarSessoes(
      { usuarioId: sessao.usuarioId, sessaoId: sessao.id },
      MOTIVO_DESCONECTADO,
    );
    await this.registrar({
      evento: AcessoEvento.sessao_desconectada,
      email: sessao.usuario.email,
      usuarioId: sessao.usuarioId,
      empresaId,
      detalhe: `Desconectada pela administração (${ator.email})`,
    });
    return { success: true, jaEncerrada: false };
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
    // Raro (fim de expediente): mais simples esvaziar do que achar as dele.
    this.situacaoCache.clear();
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

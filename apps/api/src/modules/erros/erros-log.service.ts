import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ErroOrigem, ErroTipo, Prisma } from '@prisma/client';
import type {
  ErroClienteItem,
  ErroLogConfig,
  ErroLogConfigUpdate,
  ErroLogGrupo,
  ErroLogOcorrenciaQuery,
  ErroLogQuery,
} from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';

/** Período assumido quando a consulta não informa datas. */
const DIAS_PADRAO = 7;

/**
 * Repetições da mesma assinatura dentro desta janela viram contador na linha
 * que já existe, em vez de linha nova.
 *
 * É a defesa contra o cenário que o plano previu: um bug em laço gera
 * milhares de eventos em minutos, e um log que os grava um a um transforma um
 * erro em uma falha de disponibilidade. Um minuto por assinatura limita a
 * rajada a ~1.440 linhas por dia no pior caso, mantendo cada erro *distinto*
 * com a sua própria linha.
 */
const JANELA_COLAPSO_MS = 60_000;

/** Teto do mapa de colapso — é cache de processo, não pode crescer sem fim. */
const COLAPSO_MAX_ENTRADAS = 500;

/** Por quanto tempo a configuração fica em memória (ela é lida a cada erro). */
const CONFIG_TTL_MS = 30_000;

/** Cortes de texto: o que passa disto não acrescenta diagnóstico. */
const LIMITE = {
  mensagem: 2000,
  resumo: 300,
  stack: 8000,
  rota: 500,
  userAgent: 300,
  pagina: 500,
};

const CONFIG_PADRAO: ErroLogConfig = {
  retencaoDias: 30,
  tetoPorEmpresa: 5000,
  registrar4xx: false,
  atualizadoEm: null,
};

/** Id da linha única de `erros_log_config`. */
export const ERRO_LOG_CONFIG_ID = 'unico';

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export interface RegistroErroServidor {
  tipo: ErroTipo;
  rota: string;
  metodo?: string | null;
  status?: number | null;
  mensagem: string;
  stack?: string | null;
  usuarioId?: string | null;
  usuarioEmail?: string | null;
  empresaId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Deixa a rota comparável: `/clientes/8f2c.../contatos/12` vira
 * `/clientes/:id/contatos/:id`. Sem isto, o mesmo erro em dez clientes
 * diferentes vira dez grupos e o agrupamento não agrupa nada.
 */
export function normalizarRota(rota: string): string {
  const semQuery = rota.split('?')[0];
  return semQuery
    .replace(UUID_RE, ':id')
    .split('/')
    .map((parte) => (/^\d+$/.test(parte) ? ':id' : parte))
    .join('/')
    .slice(0, LIMITE.rota);
}

/**
 * O texto que agrupa. Tira o que muda de uma ocorrência para a outra — ids,
 * números e trechos entre aspas — para que "Cliente 8f2c… não encontrado" e
 * "Cliente 4a1b… não encontrado" sejam o mesmo problema.
 */
export function normalizarMensagem(mensagem: string): string {
  return mensagem
    .replace(UUID_RE, ':id')
    .replace(/"[^"]*"/g, '"…"')
    .replace(/'[^']*'/g, "'…'")
    .replace(/\b\d[\d.,]*\b/g, ':n')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITE.resumo);
}

function assinar(partes: (string | number | null | undefined)[]): string {
  return createHash('sha1').update(partes.join('|')).digest('hex').slice(0, 16);
}

/**
 * Grava e consulta o log de erros.
 *
 * Duas regras valem para todo o caminho de escrita, e as duas doem quando
 * faltam:
 *
 * - **Nunca lançar.** Um log que derruba a resposta transforma um erro em
 *   dois — e, pior, o segundo esconde o primeiro.
 * - **Nunca chamar a si mesmo.** A falha ao gravar o erro sai pelo logger do
 *   Nest, que não passa pelo `AllExceptionsFilter`.
 */
@Injectable()
export class ErrosLogService {
  private readonly logger = new Logger(ErrosLogService.name);

  /** assinatura → linha aberta na janela de colapso. */
  private readonly colapso = new Map<string, { id: string; em: number }>();

  private configCache: { valor: ErroLogConfig; expiraEm: number } | null = null;

  /** empresaId → razão social, para não consultar a empresa a cada erro. */
  private readonly nomeEmpresa = new Map<string, string | null>();

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------- config

  async lerConfig(): Promise<ErroLogConfig> {
    if (this.configCache && this.configCache.expiraEm > Date.now()) {
      return this.configCache.valor;
    }
    try {
      const linha = await this.prisma.erroLogConfig.findUnique({
        where: { id: ERRO_LOG_CONFIG_ID },
      });
      const valor: ErroLogConfig = linha
        ? {
            retencaoDias: linha.retencaoDias,
            tetoPorEmpresa: linha.tetoPorEmpresa,
            registrar4xx: linha.registrar4xx,
            atualizadoEm: linha.atualizadoEm.toISOString(),
          }
        : CONFIG_PADRAO;
      this.configCache = { valor, expiraEm: Date.now() + CONFIG_TTL_MS };
      return valor;
    } catch (erro) {
      // Ler a configuração é parte do caminho de gravação do erro: se o banco
      // é o que está quebrado, cair aqui esconderia o problema real.
      this.logger.warn(`Falha ao ler config do log de erros: ${erro}`);
      return CONFIG_PADRAO;
    }
  }

  async atualizarConfig(
    dados: ErroLogConfigUpdate,
    atualizadoPor: string,
  ): Promise<ErroLogConfig> {
    const linha = await this.prisma.erroLogConfig.upsert({
      where: { id: ERRO_LOG_CONFIG_ID },
      create: { id: ERRO_LOG_CONFIG_ID, ...dados, atualizadoPor },
      update: { ...dados, atualizadoPor },
    });
    this.configCache = null;
    return {
      retencaoDias: linha.retencaoDias,
      tetoPorEmpresa: linha.tetoPorEmpresa,
      registrar4xx: linha.registrar4xx,
      atualizadoEm: linha.atualizadoEm.toISOString(),
    };
  }

  // -------------------------------------------------------------- escrita

  /**
   * Erro que o servidor processou. Chamado pelo `AllExceptionsFilter`, que é
   * `@Catch()` global — nenhum controller precisa ser instrumentado.
   *
   * Não espera a gravação: a resposta ao usuário não pode ficar atrás de um
   * INSERT de auditoria.
   */
  registrarDoServidor(dados: RegistroErroServidor): void {
    void this.gravar({
      origem: ErroOrigem.servidor,
      tipo: dados.tipo,
      ocorridoEm: new Date(),
      rota: dados.rota,
      metodo: dados.metodo ?? null,
      status: dados.status ?? null,
      pagina: null,
      mensagem: dados.mensagem,
      stack: dados.stack ?? null,
      usuarioId: dados.usuarioId ?? null,
      usuarioEmail: dados.usuarioEmail ?? null,
      empresaId: dados.empresaId ?? null,
      ip: dados.ip ?? null,
      userAgent: dados.userAgent ?? null,
    }).catch((erro) => {
      this.logger.error(`Falha ao registrar erro de servidor: ${erro}`);
    });
  }

  /**
   * Lote vindo do navegador. É a metade que cobre o incidente original: a API
   * estava reiniciando, a requisição não chegou, e um log só de servidor
   * mostraria a tela vazia como se nada tivesse acontecido.
   *
   * A hora é a do navegador, não a de chegada — o buffer local pode ter
   * segurado o report por minutos até a conexão voltar.
   */
  async registrarDoCliente(
    itens: ErroClienteItem[],
    contexto: {
      usuarioId: string;
      usuarioEmail: string;
      empresaId: string | null;
      ip?: string | null;
      userAgent?: string | null;
    },
  ): Promise<void> {
    for (const item of itens) {
      const ocorridoEm = new Date(item.ocorridoEm);
      await this.gravar({
        origem: ErroOrigem.cliente,
        tipo: item.tipo,
        // Relógio adiantado do navegador não pode criar erro "do futuro" e
        // fixar-se no topo da tela para sempre.
        ocorridoEm:
          Number.isNaN(ocorridoEm.getTime()) || ocorridoEm > new Date()
            ? new Date()
            : ocorridoEm,
        rota: item.rota,
        metodo: item.metodo ?? null,
        status: item.status && item.status > 0 ? item.status : null,
        pagina: item.pagina ?? null,
        mensagem: item.mensagem,
        stack: item.stack ?? null,
        usuarioId: contexto.usuarioId,
        usuarioEmail: contexto.usuarioEmail,
        empresaId: contexto.empresaId,
        ip: contexto.ip ?? null,
        userAgent: contexto.userAgent ?? null,
      }).catch((erro) => {
        this.logger.error(`Falha ao registrar erro de cliente: ${erro}`);
      });
    }
  }

  private async gravar(dados: {
    origem: ErroOrigem;
    tipo: ErroTipo;
    ocorridoEm: Date;
    rota: string;
    metodo: string | null;
    status: number | null;
    pagina: string | null;
    mensagem: string;
    stack: string | null;
    usuarioId: string | null;
    usuarioEmail: string | null;
    empresaId: string | null;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void> {
    const rotaPadrao = normalizarRota(dados.rota);
    const resumo = normalizarMensagem(dados.mensagem) || '(sem mensagem)';
    const assinatura = assinar([
      dados.origem,
      dados.tipo,
      rotaPadrao,
      dados.metodo,
      dados.status,
      resumo,
    ]);

    const agora = Date.now();
    const aberta = this.colapso.get(assinatura);
    if (aberta && agora - aberta.em < JANELA_COLAPSO_MS) {
      const atualizadas = await this.prisma.erroLog.updateMany({
        where: { id: aberta.id },
        data: { ocorrencias: { increment: 1 }, ultimaEm: dados.ocorridoEm },
      });
      // A linha pode ter sido expurgada entre a rajada e agora; nesse caso
      // segue para o INSERT em vez de perder a ocorrência.
      if (atualizadas.count > 0) {
        this.colapso.set(assinatura, { id: aberta.id, em: agora });
        return;
      }
    }

    const criada = await this.prisma.erroLog.create({
      data: {
        origem: dados.origem,
        tipo: dados.tipo,
        ocorridoEm: dados.ocorridoEm,
        ultimaEm: dados.ocorridoEm,
        rota: dados.rota.slice(0, LIMITE.rota),
        rotaPadrao,
        metodo: dados.metodo,
        status: dados.status,
        pagina: dados.pagina?.slice(0, LIMITE.pagina) ?? null,
        mensagem: dados.mensagem.slice(0, LIMITE.mensagem),
        resumo,
        stack: dados.stack?.slice(0, LIMITE.stack) ?? null,
        assinatura,
        usuarioId: dados.usuarioId,
        usuarioEmail: dados.usuarioEmail,
        empresaId: dados.empresaId,
        empresaRazaoSocial: await this.razaoSocial(dados.empresaId),
        ip: dados.ip,
        userAgent: dados.userAgent?.slice(0, LIMITE.userAgent) ?? null,
      },
      select: { id: true },
    });

    if (this.colapso.size >= COLAPSO_MAX_ENTRADAS) this.colapso.clear();
    this.colapso.set(assinatura, { id: criada.id, em: agora });
  }

  /**
   * A razão social vai gravada na linha para o log continuar legível depois
   * que a empresa for excluída — mesmo motivo de `plataforma_auditoria`. Fica
   * em cache de processo porque consultá-la a cada erro dobraria o custo da
   * gravação justamente durante uma rajada.
   */
  private async razaoSocial(empresaId: string | null): Promise<string | null> {
    if (!empresaId) return null;
    if (this.nomeEmpresa.has(empresaId)) {
      return this.nomeEmpresa.get(empresaId) ?? null;
    }
    try {
      const empresa = await this.prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { razaoSocial: true },
      });
      const nome = empresa?.razaoSocial ?? null;
      this.nomeEmpresa.set(empresaId, nome);
      return nome;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------- consultas

  private periodo(query: ErroLogQuery) {
    const fim = query.dataFim ?? new Date();
    const inicio =
      query.dataInicio ??
      new Date(fim.getTime() - DIAS_PADRAO * 24 * 60 * 60 * 1000);
    return { inicio, fim };
  }

  private where(query: ErroLogQuery): Prisma.ErroLogWhereInput {
    const { inicio, fim } = this.periodo(query);
    return {
      ultimaEm: { gte: inicio, lte: fim },
      ...(query.origem ? { origem: query.origem } : {}),
      ...(query.tipo ? { tipo: query.tipo } : {}),
      ...(query.empresaId ? { empresaId: query.empresaId } : {}),
      ...(query.search
        ? {
            OR: [
              {
                rota: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                mensagem: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
  }

  /**
   * A listagem da tela: uma linha por assinatura, com o contador.
   *
   * O `by` inclui os campos que já são determinados pela assinatura (origem,
   * tipo, rota padrão, método, status, resumo) — não muda o agrupamento e
   * evita uma segunda consulta só para descobrir como cada grupo se chama.
   */
  async listarGrupos(query: ErroLogQuery) {
    const where = this.where(query);
    const by = [
      'assinatura',
      'origem',
      'tipo',
      'rotaPadrao',
      'metodo',
      'status',
      'resumo',
    ] as const;

    const [pagina, todos] = await Promise.all([
      this.prisma.erroLog.groupBy({
        by: [...by],
        where,
        _sum: { ocorrencias: true },
        _count: { _all: true },
        _min: { ocorridoEm: true },
        _max: { ultimaEm: true },
        orderBy: { _max: { ultimaEm: 'desc' } },
        ...paginationToSkipTake(query),
      }),
      this.prisma.erroLog.groupBy({ by: ['assinatura'], where }),
    ]);

    const data: ErroLogGrupo[] = pagina.map((g) => ({
      assinatura: g.assinatura,
      origem: g.origem,
      tipo: g.tipo,
      rotaPadrao: g.rotaPadrao,
      metodo: g.metodo,
      status: g.status,
      resumo: g.resumo,
      ocorrencias: g._sum.ocorrencias ?? 0,
      linhas: g._count._all,
      primeiraEm: (g._min.ocorridoEm ?? new Date()).toISOString(),
      ultimaEm: (g._max.ultimaEm ?? new Date()).toISOString(),
    }));

    return buildPaginatedResult(data, todos.length, query);
  }

  /** As ocorrências de um grupo — o detalhe, com stack, que abre na linha. */
  async listarOcorrencias(query: ErroLogOcorrenciaQuery) {
    const where = { assinatura: query.assinatura };
    const [linhas, total] = await Promise.all([
      this.prisma.erroLog.findMany({
        where,
        ...paginationToSkipTake(query),
        orderBy: { ultimaEm: 'desc' },
      }),
      this.prisma.erroLog.count({ where }),
    ]);
    return buildPaginatedResult(linhas, total, query);
  }

  /** Os cartões do topo da tela. */
  async resumo(query: ErroLogQuery) {
    const where = this.where(query);
    const agora = Date.now();
    const desde = (horas: number) => new Date(agora - horas * 60 * 60 * 1000);

    const [ultimas24h, ultimos7Dias, grupos, porOrigem, empresas] =
      await Promise.all([
        this.prisma.erroLog.aggregate({
          where: { ultimaEm: { gte: desde(24) } },
          _sum: { ocorrencias: true },
        }),
        this.prisma.erroLog.aggregate({
          where: { ultimaEm: { gte: desde(24 * 7) } },
          _sum: { ocorrencias: true },
        }),
        this.prisma.erroLog.groupBy({ by: ['assinatura'], where }),
        this.prisma.erroLog.groupBy({
          by: ['origem'],
          where,
          _sum: { ocorrencias: true },
        }),
        this.prisma.erroLog.groupBy({ by: ['empresaId'], where }),
      ]);

    const somaDe = (origem: ErroOrigem) =>
      porOrigem.find((o) => o.origem === origem)?._sum.ocorrencias ?? 0;

    return {
      ultimas24h: ultimas24h._sum.ocorrencias ?? 0,
      ultimos7Dias: ultimos7Dias._sum.ocorrencias ?? 0,
      gruposDistintos: grupos.length,
      doServidor: somaDe(ErroOrigem.servidor),
      doCliente: somaDe(ErroOrigem.cliente),
      empresasAfetadas: empresas.filter((e) => e.empresaId !== null).length,
    };
  }

  /**
   * Apaga um grupo inteiro — o "já resolvi isto" da tela. O mapa de colapso
   * perde a entrada junto, senão a próxima ocorrência tentaria incrementar
   * uma linha que não existe mais.
   */
  async removerGrupo(assinatura: string) {
    const { count } = await this.prisma.erroLog.deleteMany({
      where: { assinatura },
    });
    this.colapso.delete(assinatura);
    return { removidos: count };
  }
}

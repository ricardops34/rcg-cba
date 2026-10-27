import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AcompanhamentoLinha,
  AcompanhamentoResposta,
} from '@plataforma/contracts';
import { PrismaService, type TenantTx } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import { corteDeVenda } from '../../common/vendas/venda-analitica';
import {
  COMODATO_DIAS_SEM_CONSUMO,
  comodatoEmPoderSql,
  comodatoSemConsumoSql,
} from '../clientes/comodato-sql';

/** As leituras são agregações grandes: a transação padrão (5 s) não basta. */
const TEMPO_MAXIMO_MS = 60_000;
/** Janela do cadastro: "atualizado" é uma pergunta de meses, não de semanas. */
const CADASTRO_DIAS = 180;
/** Resposta "rápida" no atendimento por WhatsApp. */
const RESPOSTA_RAPIDA_MIN = 15;
/** Conversa em que o cliente escreveu e ninguém respondeu há mais que isto. */
const SEM_RESPOSTA_MIN = 60;
const DIA_MS = 86_400_000;

type Linha = Record<string, string | number | null>;
type VendedorBase = { id: string; nome: string; nomeReduzido: string | null };

const n = (v: unknown): number =>
  v === null || v === undefined ? 0 : Number(v);
const arred = (v: unknown, casas = 1): number | null => {
  if (v === null || v === undefined) return null;
  const f = 10 ** casas;
  return Math.round(Number(v) * f) / f;
};
const pct = (parte: number, todo: number): number | null =>
  todo > 0 ? Math.round((parte / todo) * 1000) / 10 : null;

/**
 * Acompanhamento da equipe (docs/planos/2026-10-27-acompanhamento-equipe.md).
 *
 * Cada método devolve **uma linha por vendedor** dentro do escopo de quem
 * pede (a mesma hierarquia de Clientes e Dashboard: o Supervisor vê o time, o
 * Gerente e o Diretor a carteira que o perfil alcança) e uma linha de total.
 * O vendedor sem movimento aparece com zeros: o que some de uma tabela de
 * acompanhamento é justamente o que o gestor quer notar.
 */
@Injectable()
export class AcompanhamentoService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------
  // Base comum
  // ------------------------------------------------------------------

  private async vendedoresDoEscopo(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
  ) {
    const escopo = await resolverEscopoVendedores(tx, empresaId, user);
    const vendedores: VendedorBase[] = await tx.vendedor.findMany({
      where: {
        empresaId,
        deletedAt: null,
        ativo: true,
        desligado: false,
        ...(escopo ? { id: { in: escopo } } : {}),
      },
      select: { id: true, nome: true, nomeReduzido: true },
      orderBy: { nome: 'asc' },
    });
    return { escopo, vendedores, ids: vendedores.map((v) => v.id) };
  }

  private execucao<T>(empresaId: string, fn: (tx: TenantTx) => Promise<T>) {
    return this.prisma.withTenant(empresaId, fn, { timeout: TEMPO_MAXIMO_MS });
  }

  /** Junta o resultado do SQL com os vendedores: quem não tem movimento fica com zeros. */
  private montar(
    vendedores: VendedorBase[],
    porVendedor: Map<string, Linha>,
    zeros: Linha,
  ): AcompanhamentoLinha[] {
    return vendedores.map((v) => ({
      vendedorId: v.id,
      vendedor: v.nomeReduzido || v.nome,
      ...zeros,
      ...(porVendedor.get(v.id) ?? {}),
    }));
  }

  private vazio(periodoDias: number): AcompanhamentoResposta {
    return { periodoDias, linhas: [], total: {} };
  }

  private somar(linhas: AcompanhamentoLinha[], campos: string[]) {
    const total: Record<string, number | null> = {};
    for (const c of campos) total[c] = linhas.reduce((s, l) => s + n(l[c]), 0);
    return total;
  }

  /** Média das linhas que têm o campo, ponderada por `peso` (ou simples sem ele). */
  private mediaDe(
    linhas: AcompanhamentoLinha[],
    campo: string,
    peso?: string,
    casas = 1,
  ): number | null {
    const com = linhas.filter((l) => l[campo] !== null && (!peso || n(l[peso]) > 0));
    if (com.length === 0) return null;
    const pesoTotal = com.reduce((s, l) => s + (peso ? n(l[peso]) : 1), 0);
    const soma = com.reduce((s, l) => s + n(l[campo]) * (peso ? n(l[peso]) : 1), 0);
    return arred(soma / Math.max(1, pesoTotal), casas);
  }

  // ------------------------------------------------------------------
  // 1. Atendimento por WhatsApp
  // ------------------------------------------------------------------

  /**
   * Por vendedor: conversas com movimento, mensagens, e o **tempo até a
   * primeira resposta** — da primeira mensagem do cliente na janela até a
   * primeira de uma pessoa depois dela. Mensagem da IA ou do sistema (sem
   * `enviadaPor`) não conta como resposta. Só aparelhos de vendedor: o número
   * da empresa é medido pelos indicadores da triagem.
   */
  async atendimento(
    empresaId: string,
    user: AuthenticatedUser,
    dias: number,
  ): Promise<AcompanhamentoResposta> {
    return this.execucao(empresaId, async (tx) => {
      const { vendedores, ids } = await this.vendedoresDoEscopo(tx, empresaId, user);
      if (ids.length === 0) return this.vazio(dias);
      const desde = new Date(Date.now() - dias * DIA_MS);

      const linhas = await tx.$queryRaw<Linha[]>`
        WITH conv AS (
          SELECT c."id", s."vendedorId"
            FROM "whatsapp_conversas" c
            JOIN "whatsapp_sessoes" s ON s."id" = c."sessaoId"
           WHERE c."empresaId" = ${empresaId}
             AND s."tipo" = 'vendedor'
             AND s."vendedorId" IN (${Prisma.join(ids)})
             AND c."ultimaMensagemEm" >= ${desde}
        ), turno AS (
          SELECT conv."id", conv."vendedorId",
                 (SELECT MIN(m."criadaEm") FROM "whatsapp_mensagens" m
                   WHERE m."conversaId" = conv."id" AND m."direcao" = 'entrada'
                     AND m."criadaEm" >= ${desde}) AS entrou
            FROM conv
        ), resp AS (
          SELECT t."id", t."vendedorId", t."entrou",
                 (SELECT MIN(m."criadaEm") FROM "whatsapp_mensagens" m
                   WHERE m."conversaId" = t."id" AND m."direcao" = 'saida'
                     AND m."enviadaPor" IS NOT NULL AND m."criadaEm" > t."entrou") AS respondeu
            FROM turno t
           WHERE t."entrou" IS NOT NULL
        ), msgs AS (
          SELECT conv."vendedorId",
                 COUNT(*) FILTER (WHERE m."direcao" = 'entrada') AS recebidas,
                 COUNT(*) FILTER (WHERE m."direcao" = 'saida' AND m."enviadaPor" IS NOT NULL) AS enviadas
            FROM conv
            JOIN "whatsapp_mensagens" m ON m."conversaId" = conv."id" AND m."criadaEm" >= ${desde}
           GROUP BY conv."vendedorId"
        ), por AS (
          SELECT r."vendedorId",
                 COUNT(*) AS conversas,
                 COUNT(r."respondeu") AS respondidas,
                 AVG(EXTRACT(EPOCH FROM (r."respondeu" - r."entrou")) / 60) AS media_min,
                 COUNT(*) FILTER (WHERE r."respondeu" - r."entrou" <= make_interval(mins => ${RESPOSTA_RAPIDA_MIN}::int)) AS rapidas,
                 COUNT(*) FILTER (WHERE r."respondeu" IS NULL
                                    AND r."entrou" < NOW() - make_interval(mins => ${SEM_RESPOSTA_MIN}::int)) AS sem_resposta
            FROM resp r
           GROUP BY r."vendedorId"
        )
        SELECT v."id" AS "vendedorId",
               COALESCE(por."conversas", 0)::int AS conversas,
               COALESCE(msgs."recebidas", 0)::int AS recebidas,
               COALESCE(msgs."enviadas", 0)::int AS enviadas,
               COALESCE(por."respondidas", 0)::int AS respondidas,
               por."media_min" AS "mediaMin",
               COALESCE(por."rapidas", 0)::int AS rapidas,
               COALESCE(por."sem_resposta", 0)::int AS "semResposta"
          FROM "vendedores" v
          LEFT JOIN por ON por."vendedorId" = v."id"
          LEFT JOIN msgs ON msgs."vendedorId" = v."id"
         WHERE v."id" IN (${Prisma.join(ids)})
      `;
      const porVendedor = new Map<string, Linha>();
      let rapidasTotal = 0;
      for (const l of linhas) {
        const conversas = n(l.conversas);
        rapidasTotal += n(l.rapidas);
        porVendedor.set(String(l.vendedorId), {
          conversas,
          recebidas: n(l.recebidas),
          enviadas: n(l.enviadas),
          respondidas: n(l.respondidas),
          mediaMin: arred(l.mediaMin),
          pctRapidas: pct(n(l.rapidas), conversas),
          semResposta: n(l.semResposta),
        });
      }
      const lista = this.montar(vendedores, porVendedor, {
        conversas: 0,
        recebidas: 0,
        enviadas: 0,
        respondidas: 0,
        mediaMin: null,
        pctRapidas: null,
        semResposta: 0,
      });
      const total = this.somar(lista, [
        'conversas',
        'recebidas',
        'enviadas',
        'respondidas',
        'semResposta',
      ]);
      total.mediaMin = this.mediaDe(lista, 'mediaMin', 'conversas');
      total.pctRapidas = pct(rapidasTotal, n(total.conversas));
      return {
        periodoDias: dias,
        nota:
          'Primeira resposta: da primeira mensagem do cliente na janela até a primeira de uma pessoa (a IA não conta). ' +
          `"Rápidas" = até ${RESPOSTA_RAPIDA_MIN} min. "Sem resposta" = o cliente escreveu há mais de ${SEM_RESPOSTA_MIN} min e ninguém respondeu.`,
        linhas: lista,
        total,
      };
    });
  }

  // ------------------------------------------------------------------
  // 2. Conversas com contatos não vinculados
  // ------------------------------------------------------------------

  /**
   * Conversas cujo contato **não está ligado a um cliente**: é atendimento
   * que não entra na carteira de ninguém e, portanto, não aparece em nenhum
   * outro número. Inclui o número da empresa, para quem enxerga tudo.
   */
  async naoVinculados(
    empresaId: string,
    user: AuthenticatedUser,
    dias: number,
  ): Promise<AcompanhamentoResposta> {
    return this.execucao(empresaId, async (tx) => {
      const { escopo, vendedores, ids } = await this.vendedoresDoEscopo(
        tx,
        empresaId,
        user,
      );
      const desde = new Date(Date.now() - dias * DIA_MS);
      const incluiEmpresa = escopo === null;
      if (ids.length === 0 && !incluiEmpresa) return this.vazio(dias);

      const filtroSessao = incluiEmpresa
        ? Prisma.sql`(s."vendedorId" IN (${Prisma.join(ids.length ? ids : ['-'])}) OR s."tipo" = 'empresa')`
        : Prisma.sql`s."vendedorId" IN (${Prisma.join(ids)})`;

      const linhas = await tx.$queryRaw<Linha[]>`
        SELECT s."vendedorId" AS "vendedorId",
               COUNT(DISTINCT c."id")::int AS conversas,
               COUNT(m."id") FILTER (WHERE m."direcao" = 'entrada')::int AS recebidas,
               COUNT(m."id") FILTER (WHERE m."direcao" = 'saida' AND m."enviadaPor" IS NOT NULL)::int AS enviadas
          FROM "whatsapp_conversas" c
          JOIN "whatsapp_sessoes" s ON s."id" = c."sessaoId"
          LEFT JOIN "whatsapp_mensagens" m ON m."conversaId" = c."id" AND m."criadaEm" >= ${desde}
         WHERE c."empresaId" = ${empresaId}
           AND c."clienteId" IS NULL
           AND c."ultimaMensagemEm" >= ${desde}
           AND ${filtroSessao}
         GROUP BY s."vendedorId"
      `;
      const porVendedor = new Map<string, Linha>();
      let empresa: Linha | null = null;
      for (const l of linhas) {
        const dados = {
          conversas: n(l.conversas),
          recebidas: n(l.recebidas),
          enviadas: n(l.enviadas),
        };
        if (l.vendedorId) porVendedor.set(String(l.vendedorId), dados);
        else empresa = dados;
      }
      const zeros = { conversas: 0, recebidas: 0, enviadas: 0 };
      const lista = this.montar(vendedores, porVendedor, zeros);
      if (incluiEmpresa) {
        lista.push({
          vendedorId: null,
          vendedor: 'Número da empresa',
          ...zeros,
          ...(empresa ?? {}),
        });
      }

      const detalhe = await tx.$queryRaw<Linha[]>`
        SELECT COALESCE(ct."nomeExibicao", ct."telefoneNormalizado", split_part(ct."jid", '@', 1)) AS contato,
               ct."telefoneNormalizado" AS telefone,
               COALESCE(v."nomeReduzido", v."nome", 'Número da empresa') AS vendedor,
               c."ultimaMensagemEm" AS "ultimaMensagem",
               (SELECT COUNT(*) FROM "whatsapp_mensagens" m
                 WHERE m."conversaId" = c."id" AND m."criadaEm" >= ${desde})::int AS mensagens
          FROM "whatsapp_conversas" c
          JOIN "whatsapp_sessoes" s ON s."id" = c."sessaoId"
          JOIN "whatsapp_contatos" ct ON ct."id" = c."contatoId"
          LEFT JOIN "vendedores" v ON v."id" = s."vendedorId"
         WHERE c."empresaId" = ${empresaId} AND c."clienteId" IS NULL
           AND c."ultimaMensagemEm" >= ${desde}
           AND ${filtroSessao}
         ORDER BY mensagens DESC, c."ultimaMensagemEm" DESC
         LIMIT 30
      `;
      return {
        periodoDias: dias,
        nota: 'Conversas em que o contato não está ligado a um cliente. Vincular o cliente leva o atendimento para a carteira e para os demais números.',
        linhas: lista,
        total: this.somar(lista, ['conversas', 'recebidas', 'enviadas']),
        detalhe: detalhe.map((d) => ({
          ...d,
          mensagens: n(d.mensagens),
          ultimaMensagem: d.ultimaMensagem
            ? new Date(String(d.ultimaMensagem)).toISOString()
            : null,
        })),
      };
    });
  }

  // ------------------------------------------------------------------
  // 3. Cobertura de carteira
  // ------------------------------------------------------------------

  /**
   * Cobertura = clientes ativos que **compraram ou foram contatados** na
   * janela (visita, atendimento registrado, atividade concluída ou mensagem de
   * uma pessoa pelo WhatsApp) ÷ clientes ativos. Cliente sem nenhum dos dois é
   * o que o gestor precisa cobrar.
   */
  async carteira(
    empresaId: string,
    user: AuthenticatedUser,
    dias: number,
  ): Promise<AcompanhamentoResposta> {
    return this.execucao(empresaId, async (tx) => {
      const { vendedores, ids } = await this.vendedoresDoEscopo(tx, empresaId, user);
      if (ids.length === 0) return this.vazio(dias);
      const desde = new Date(Date.now() - dias * DIA_MS);

      const linhas = await tx.$queryRaw<Linha[]>`
        WITH base AS (
          SELECT c."id", c."vendedorId",
                 COALESCE(c."ultimaCompra" >= ${desde}::date, false) AS comprou,
                 (COALESCE(c."ultimaVisita" >= ${desde}::date, false)
                  OR COALESCE(c."ultimoAtendimento" >= ${desde}::date, false)
                  OR EXISTS (SELECT 1 FROM "atividades" a
                              WHERE a."empresaId" = c."empresaId" AND a."clienteId" = c."id"
                                AND a."concluida" = true AND a."deletedAt" IS NULL
                                AND a."dataConclusao" >= ${desde})
                  OR EXISTS (SELECT 1 FROM "whatsapp_conversas" w
                              JOIN "whatsapp_mensagens" m ON m."conversaId" = w."id"
                             WHERE w."empresaId" = c."empresaId" AND w."clienteId" = c."id"
                               AND m."direcao" = 'saida' AND m."enviadaPor" IS NOT NULL
                               AND m."criadaEm" >= ${desde})) AS contatado,
                 (c."ultimaCompra" IS NULL) AS nunca
            FROM "clientes" c
           WHERE c."empresaId" = ${empresaId} AND c."deletedAt" IS NULL AND c."ativo" = true
             AND c."vendedorId" IN (${Prisma.join(ids)})
        )
        SELECT "vendedorId",
               COUNT(*)::int AS clientes,
               COUNT(*) FILTER (WHERE comprou)::int AS comprou,
               COUNT(*) FILTER (WHERE contatado)::int AS contatados,
               COUNT(*) FILTER (WHERE comprou OR contatado)::int AS cobertos,
               COUNT(*) FILTER (WHERE NOT comprou AND NOT contatado)::int AS "semMovimento",
               COUNT(*) FILTER (WHERE nunca)::int AS "nuncaCompraram"
          FROM base GROUP BY "vendedorId"
      `;
      const porVendedor = new Map<string, Linha>();
      for (const l of linhas) {
        const clientes = n(l.clientes);
        porVendedor.set(String(l.vendedorId), {
          clientes,
          comprou: n(l.comprou),
          contatados: n(l.contatados),
          cobertos: n(l.cobertos),
          pctCobertura: pct(n(l.cobertos), clientes),
          semMovimento: n(l.semMovimento),
          nuncaCompraram: n(l.nuncaCompraram),
        });
      }
      const lista = this.montar(vendedores, porVendedor, {
        clientes: 0,
        comprou: 0,
        contatados: 0,
        cobertos: 0,
        pctCobertura: null,
        semMovimento: 0,
        nuncaCompraram: 0,
      });
      const total = this.somar(lista, [
        'clientes',
        'comprou',
        'contatados',
        'cobertos',
        'semMovimento',
        'nuncaCompraram',
      ]);
      total.pctCobertura = pct(n(total.cobertos), n(total.clientes));
      return {
        periodoDias: dias,
        nota: 'Coberto = comprou ou foi contatado (visita, atendimento, atividade concluída ou mensagem de uma pessoa no WhatsApp) na janela. Só clientes ativos.',
        linhas: lista,
        total,
      };
    });
  }

  // ------------------------------------------------------------------
  // 4. Atualização cadastral
  // ------------------------------------------------------------------

  async cadastro(
    empresaId: string,
    user: AuthenticatedUser,
  ): Promise<AcompanhamentoResposta> {
    return this.execucao(empresaId, async (tx) => {
      const { vendedores, ids } = await this.vendedoresDoEscopo(tx, empresaId, user);
      if (ids.length === 0) return this.vazio(CADASTRO_DIAS);
      const desde = new Date(Date.now() - CADASTRO_DIAS * DIA_MS);

      const linhas = await tx.$queryRaw<Linha[]>`
        WITH base AS (
          SELECT c."id", c."vendedorId",
                 (COALESCE(BTRIM(c."email"), '') <> '') AS email,
                 (COALESCE(BTRIM(c."celular"), '') <> '' OR COALESCE(BTRIM(c."telefone"), '') <> '') AS telefone,
                 (EXISTS (SELECT 1 FROM "cliente_contatos" cc
                           WHERE cc."empresaId" = c."empresaId" AND cc."clienteId" = c."id" AND cc."ativo" = true)
                  OR COALESCE(BTRIM(c."contato1Nome"), '') <> '') AS contato,
                 COALESCE(c."dataConsultaRfb" >= ${desde}::date, false) AS receita,
                 (c."updatedBy" IS NOT NULL AND c."updatedBy" NOT LIKE 'integracao:%' AND c."updatedAt" >= ${desde}) AS manual
            FROM "clientes" c
           WHERE c."empresaId" = ${empresaId} AND c."deletedAt" IS NULL AND c."ativo" = true
             AND c."vendedorId" IN (${Prisma.join(ids)})
        )
        SELECT "vendedorId",
               COUNT(*)::int AS clientes,
               COUNT(*) FILTER (WHERE email)::int AS "comEmail",
               COUNT(*) FILTER (WHERE telefone)::int AS "comTelefone",
               COUNT(*) FILTER (WHERE contato)::int AS "comContato",
               COUNT(*) FILTER (WHERE email AND telefone AND contato)::int AS completos,
               COUNT(*) FILTER (WHERE receita)::int AS "receitaRecente",
               COUNT(*) FILTER (WHERE manual)::int AS "atualizadosMao"
          FROM base GROUP BY "vendedorId"
      `;
      const porVendedor = new Map<string, Linha>();
      for (const l of linhas) {
        const clientes = n(l.clientes);
        porVendedor.set(String(l.vendedorId), {
          clientes,
          comEmail: n(l.comEmail),
          comTelefone: n(l.comTelefone),
          comContato: n(l.comContato),
          completos: n(l.completos),
          pctCompletos: pct(n(l.completos), clientes),
          receitaRecente: n(l.receitaRecente),
          atualizadosMao: n(l.atualizadosMao),
        });
      }
      const lista = this.montar(vendedores, porVendedor, {
        clientes: 0,
        comEmail: 0,
        comTelefone: 0,
        comContato: 0,
        completos: 0,
        pctCompletos: null,
        receitaRecente: 0,
        atualizadosMao: 0,
      });
      const total = this.somar(lista, [
        'clientes',
        'comEmail',
        'comTelefone',
        'comContato',
        'completos',
        'receitaRecente',
        'atualizadosMao',
      ]);
      total.pctCompletos = pct(n(total.completos), n(total.clientes));
      return {
        periodoDias: CADASTRO_DIAS,
        nota: `Janela fixa de ${CADASTRO_DIAS} dias. Completo = e-mail, telefone e ao menos um contato. "Receita" = consultado na Receita no período. "À mão" = alterado por uma pessoa (e não pela integração) no período.`,
        linhas: lista,
        total,
      };
    });
  }

  // ------------------------------------------------------------------
  // 5. Mix por cliente
  // ------------------------------------------------------------------

  /**
   * Mix = produtos **distintos** comprados por cliente. Compara a janela com a
   * anterior, do mesmo tamanho, entre os clientes que compraram na janela
   * atual. Vem do mesmo corte de venda do Dashboard e das Consultas.
   */
  async mix(
    empresaId: string,
    user: AuthenticatedUser,
    dias: number,
  ): Promise<AcompanhamentoResposta> {
    return this.execucao(empresaId, async (tx) => {
      const { vendedores, ids } = await this.vendedoresDoEscopo(tx, empresaId, user);
      if (ids.length === 0) return this.vazio(dias);
      const venda = await corteDeVenda(tx, empresaId);
      const hoje = Date.now();
      const inicioAtual = new Date(hoje - dias * DIA_MS);
      const inicioAnterior = new Date(hoje - 2 * dias * DIA_MS);

      const linhas = await tx.$queryRaw<Linha[]>`
        WITH vendas AS (
          SELECT i."clienteId", c."vendedorId", i."produtoId",
                 (i."dtEmissao" >= ${inicioAtual}::date) AS atual
            FROM "notas_saida_itens" i
            JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
            JOIN "clientes" c ON c."id" = i."clienteId"
            LEFT JOIN "produtos" prod_cat ON prod_cat."id" = i."produtoId"
            LEFT JOIN "categorias" cat ON cat."id" = prod_cat."categoriaId"
           WHERE i."empresaId" = ${empresaId}
             AND i."clienteId" IS NOT NULL AND i."produtoId" IS NOT NULL
             AND i."dtEmissao" >= ${inicioAnterior}::date
             AND c."vendedorId" IN (${Prisma.join(ids)})
             AND ${Prisma.join(venda.notaSql, ' AND ')}
             AND ${Prisma.join(venda.itemSql, ' AND ')}
        ), por_cliente AS (
          SELECT "clienteId", "vendedorId",
                 COUNT(DISTINCT "produtoId") FILTER (WHERE atual) AS mix_atual,
                 COUNT(DISTINCT "produtoId") FILTER (WHERE NOT atual) AS mix_anterior
            FROM vendas GROUP BY "clienteId", "vendedorId"
          HAVING COUNT(*) FILTER (WHERE atual) > 0
        )
        SELECT "vendedorId",
               COUNT(*)::int AS clientes,
               AVG(mix_atual) AS "mixAtual",
               AVG(mix_anterior) AS "mixAnterior",
               COUNT(*) FILTER (WHERE mix_atual > mix_anterior)::int AS subiram,
               COUNT(*) FILTER (WHERE mix_atual < mix_anterior)::int AS cairam
          FROM por_cliente GROUP BY "vendedorId"
      `;
      const porVendedor = new Map<string, Linha>();
      for (const l of linhas) {
        const atual = arred(l.mixAtual, 2);
        const anterior = arred(l.mixAnterior, 2);
        porVendedor.set(String(l.vendedorId), {
          clientes: n(l.clientes),
          mixAtual: atual,
          mixAnterior: anterior,
          variacao:
            atual !== null && anterior !== null ? arred(atual - anterior, 2) : null,
          subiram: n(l.subiram),
          cairam: n(l.cairam),
        });
      }
      const lista = this.montar(vendedores, porVendedor, {
        clientes: 0,
        mixAtual: null,
        mixAnterior: null,
        variacao: null,
        subiram: 0,
        cairam: 0,
      });
      const total = this.somar(lista, ['clientes', 'subiram', 'cairam']);
      total.mixAtual = this.mediaDe(lista, 'mixAtual', 'clientes', 2);
      total.mixAnterior = this.mediaDe(lista, 'mixAnterior', 'clientes', 2);
      total.variacao =
        total.mixAtual !== null && total.mixAnterior !== null
          ? arred(total.mixAtual - total.mixAnterior, 2)
          : null;
      return {
        periodoDias: dias,
        nota: 'Produtos distintos comprados por cliente na janela × na janela anterior (mesmo tamanho), entre os clientes que compraram na janela. Mesmo corte de venda do Dashboard.',
        linhas: lista,
        total,
      };
    });
  }

  // ------------------------------------------------------------------
  // 6. Descontos
  // ------------------------------------------------------------------

  async descontos(
    empresaId: string,
    user: AuthenticatedUser,
    dias: number,
  ): Promise<AcompanhamentoResposta> {
    return this.execucao(empresaId, async (tx) => {
      const { vendedores, ids } = await this.vendedoresDoEscopo(tx, empresaId, user);
      if (ids.length === 0) return this.vazio(dias);
      const desde = new Date(Date.now() - dias * DIA_MS);

      const itens = await tx.$queryRaw<Linha[]>`
        SELECT o."vendedorId",
               COUNT(DISTINCT o."id")::int AS orcamentos,
               COUNT(i."id")::int AS itens,
               COUNT(i."id") FILTER (WHERE COALESCE(i."percDesconto", 0) > 0)::int AS "itensComDesconto",
               SUM(i."percDesconto" * i."vlrTotal") FILTER (WHERE i."percDesconto" IS NOT NULL)
                 / NULLIF(SUM(i."vlrTotal") FILTER (WHERE i."percDesconto" IS NOT NULL), 0) AS "descontoMedio",
               MAX(i."percDesconto") AS "descontoMaximo"
          FROM "orcamentos" o
          JOIN "orcamento_itens" i ON i."orcamentoId" = o."id"
         WHERE o."empresaId" = ${empresaId} AND o."deletedAt" IS NULL
           AND o."createdAt" >= ${desde}
           AND o."vendedorId" IN (${Prisma.join(ids)})
         GROUP BY o."vendedorId"
      `;
      const liberacoes = await tx.$queryRaw<Linha[]>`
        SELECT o."vendedorId",
               COUNT(*) FILTER (WHERE o."descontoSolicitadoEm" >= ${desde})::int AS pedidos,
               COUNT(*) FILTER (WHERE o."descontoAutorizadoEm" >= ${desde})::int AS autorizados,
               COUNT(*) FILTER (WHERE o."descontoRecusadoEm" >= ${desde})::int AS recusados
          FROM "orcamentos" o
         WHERE o."empresaId" = ${empresaId} AND o."deletedAt" IS NULL
           AND o."vendedorId" IN (${Prisma.join(ids)})
         GROUP BY o."vendedorId"
      `;
      const porVendedor = new Map<string, Linha>();
      let itensComDescontoTotal = 0;
      for (const l of itens) {
        itensComDescontoTotal += n(l.itensComDesconto);
        porVendedor.set(String(l.vendedorId), {
          orcamentos: n(l.orcamentos),
          itens: n(l.itens),
          pctItensComDesconto: pct(n(l.itensComDesconto), n(l.itens)),
          descontoMedio: arred(l.descontoMedio),
          descontoMaximo: arred(l.descontoMaximo),
        });
      }
      for (const l of liberacoes) {
        const id = String(l.vendedorId);
        porVendedor.set(id, {
          ...(porVendedor.get(id) ?? {}),
          pedidos: n(l.pedidos),
          autorizados: n(l.autorizados),
          recusados: n(l.recusados),
        });
      }
      const lista = this.montar(vendedores, porVendedor, {
        orcamentos: 0,
        itens: 0,
        pctItensComDesconto: null,
        descontoMedio: null,
        descontoMaximo: null,
        pedidos: 0,
        autorizados: 0,
        recusados: 0,
      });
      const total = this.somar(lista, [
        'orcamentos',
        'itens',
        'pedidos',
        'autorizados',
        'recusados',
      ]);
      total.descontoMedio = this.mediaDe(lista, 'descontoMedio', 'itens');
      const maximos = lista.filter((l) => l.descontoMaximo !== null);
      total.descontoMaximo = maximos.length
        ? Math.max(...maximos.map((l) => n(l.descontoMaximo)))
        : null;
      total.pctItensComDesconto = pct(itensComDescontoTotal, n(total.itens));
      return {
        periodoDias: dias,
        nota: 'Desconto médio = % de desconto dos itens dos orçamentos criados na janela, ponderado pelo valor do item. Pedidos, autorizados e recusados = liberações de desconto no período.',
        linhas: lista,
        total,
      };
    });
  }

  // ------------------------------------------------------------------
  // 7. Orçamentos
  // ------------------------------------------------------------------

  async orcamentos(
    empresaId: string,
    user: AuthenticatedUser,
    dias: number,
  ): Promise<AcompanhamentoResposta> {
    return this.execucao(empresaId, async (tx) => {
      const { vendedores, ids } = await this.vendedoresDoEscopo(tx, empresaId, user);
      if (ids.length === 0) return this.vazio(dias);
      const desde = new Date(Date.now() - dias * DIA_MS);

      const linhas = await tx.$queryRaw<Linha[]>`
        SELECT o."vendedorId",
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE o."status" = 'rascunho')::int AS rascunho,
               COUNT(*) FILTER (WHERE o."status" = 'enviado')::int AS enviado,
               COUNT(*) FILTER (WHERE o."status" = 'aprovado')::int AS aprovado,
               COUNT(*) FILTER (WHERE o."status" = 'recusado')::int AS recusado,
               COUNT(*) FILTER (WHERE o."status" = 'expirado')::int AS expirado,
               COALESCE(SUM(o."vlrTotal") FILTER (WHERE o."status" = 'aprovado'), 0) AS "valorAprovado",
               COALESCE(SUM(o."vlrTotal") FILTER (WHERE o."status" IN ('rascunho', 'enviado')), 0) AS "valorAberto",
               COUNT(*) FILTER (WHERE o."canalOrigem" = 'whatsapp')::int AS "nasceramWhatsapp",
               COUNT(*) FILTER (WHERE o."canalEnvio" = 'whatsapp')::int AS "enviadosWhatsapp",
               AVG(EXTRACT(EPOCH FROM (o."clienteDecididoEm" - o."enviadoEm")) / 3600)
                 FILTER (WHERE o."enviadoEm" IS NOT NULL AND o."clienteDecididoEm" IS NOT NULL
                           AND o."clienteDecisaoCanal" IS DISTINCT FROM 'sistema'
                           AND o."clienteDecididoEm" >= o."enviadoEm") AS "horasDecisao",
               AVG(EXTRACT(EPOCH FROM (o."clienteDecididoEm" - o."enviadoEm")) / 3600)
                 FILTER (WHERE o."enviadoEm" IS NOT NULL AND o."clienteDecididoEm" IS NOT NULL
                           AND o."clienteDecisaoCanal" = 'sistema'
                           AND o."clienteDecididoEm" >= o."enviadoEm") AS "horasDecisaoVendedor"
          FROM "orcamentos" o
         WHERE o."empresaId" = ${empresaId} AND o."deletedAt" IS NULL AND o."ativo" = true
           AND o."createdAt" >= ${desde}
           AND o."vendedorId" IN (${Prisma.join(ids)})
           AND o."origem" <> 'erp'
         GROUP BY o."vendedorId"
      `;
      const porVendedor = new Map<string, Linha>();
      for (const l of linhas) {
        const finalizados = n(l.aprovado) + n(l.recusado) + n(l.expirado);
        porVendedor.set(String(l.vendedorId), {
          total: n(l.total),
          finalizados,
          abertos: n(l.rascunho) + n(l.enviado),
          rascunho: n(l.rascunho),
          enviado: n(l.enviado),
          aprovado: n(l.aprovado),
          recusado: n(l.recusado),
          expirado: n(l.expirado),
          pctConversao: pct(n(l.aprovado), n(l.enviado) + finalizados),
          valorAprovado: arred(l.valorAprovado, 2),
          valorAberto: arred(l.valorAberto, 2),
          nasceramWhatsapp: n(l.nasceramWhatsapp),
          enviadosWhatsapp: n(l.enviadosWhatsapp),
          horasDecisao: arred(l.horasDecisao),
          horasDecisaoVendedor: arred(l.horasDecisaoVendedor),
        });
      }
      const lista = this.montar(vendedores, porVendedor, {
        total: 0,
        finalizados: 0,
        abertos: 0,
        rascunho: 0,
        enviado: 0,
        aprovado: 0,
        recusado: 0,
        expirado: 0,
        pctConversao: null,
        valorAprovado: 0,
        valorAberto: 0,
        nasceramWhatsapp: 0,
        enviadosWhatsapp: 0,
        horasDecisao: null,
        horasDecisaoVendedor: null,
      });
      const total = this.somar(lista, [
        'total',
        'finalizados',
        'abertos',
        'rascunho',
        'enviado',
        'aprovado',
        'recusado',
        'expirado',
        'valorAprovado',
        'valorAberto',
        'nasceramWhatsapp',
        'enviadosWhatsapp',
      ]);
      total.pctConversao = pct(
        n(total.aprovado),
        n(total.enviado) + n(total.finalizados),
      );
      total.horasDecisao = this.mediaDe(lista, 'horasDecisao');
      total.horasDecisaoVendedor = this.mediaDe(lista, 'horasDecisaoVendedor');
      return {
        periodoDias: dias,
        nota:
          'Orçamentos criados na janela, sem os que vieram do ERP. Finalizado = aprovado, recusado ou vencido; aberto = rascunho ou enviado. ' +
          'Tempo de decisão = do primeiro envio (WhatsApp ou link) até a resposta do cliente; decisão registrada pelo próprio vendedor fica na coluna à parte. ' +
          'Orçamentos antigos sem registro de envio ficam fora do tempo.',
        linhas: lista,
        total,
      };
    });
  }

  // ------------------------------------------------------------------
  // 8. Comodato sem compra
  // ------------------------------------------------------------------

  /**
   * Cliente com equipamento em comodato em poder (saldo > 0) que:
   * - **não comprou nada** na janela; e
   * - **não comprou produto aplicável** ao equipamento na janela — a regra e
   *   a janela do aviso "sem consumo" da Posição de Cliente
   *   (`clientes/comodato-sql.ts`). As duas usam a mesma janela fixa.
   */
  async comodato(
    empresaId: string,
    user: AuthenticatedUser,
  ): Promise<AcompanhamentoResposta> {
    const dias = COMODATO_DIAS_SEM_CONSUMO;
    return this.execucao(empresaId, async (tx) => {
      const { vendedores, ids } = await this.vendedoresDoEscopo(tx, empresaId, user);
      if (ids.length === 0) return this.vazio(dias);

      const clientes = await tx.$queryRaw<Linha[]>`
        SELECT c."id", c."vendedorId", c."razaoSocial", c."nomeFantasia", c."ultimaCompra",
               ${comodatoSemConsumoSql(empresaId)} AS "semAplicaveis",
               NOT EXISTS (
                 SELECT 1 FROM "notas_saida_itens" i
                   JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
                  WHERE i."empresaId" = c."empresaId" AND i."clienteId" = c."id"
                    AND n."tipo" = 'N' AND n."ativo" = true AND n."deletedAt" IS NULL
                    AND i."comodato" = false AND i."ativo" = true AND i."deletedAt" IS NULL
                    AND i."dtEmissao" >= CURRENT_DATE - ${dias}::int
               ) AS "semCompra"
          FROM "clientes" c
         WHERE c."empresaId" = ${empresaId} AND c."deletedAt" IS NULL AND c."ativo" = true
           AND c."vendedorId" IN (${Prisma.join(ids)})
           AND ${comodatoEmPoderSql(empresaId)}
      `;
      const porVendedor = new Map<string, Linha>();
      for (const c of clientes) {
        const id = String(c.vendedorId);
        const atual = (porVendedor.get(id) ?? {
          comComodato: 0,
          semCompra: 0,
          semAplicaveis: 0,
        }) as Record<string, number>;
        atual.comComodato += 1;
        if (c.semCompra) atual.semCompra += 1;
        if (c.semAplicaveis) atual.semAplicaveis += 1;
        porVendedor.set(id, atual);
      }
      const lista = this.montar(vendedores, porVendedor, {
        comComodato: 0,
        semCompra: 0,
        semAplicaveis: 0,
      });
      const nomeDe = new Map(
        vendedores.map((v) => [v.id, v.nomeReduzido || v.nome] as const),
      );
      const detalhe = clientes
        .filter((c) => c.semCompra || c.semAplicaveis)
        .sort((a, b) => Number(!!b.semCompra) - Number(!!a.semCompra))
        .slice(0, 100)
        .map((c) => ({
          cliente: String(c.nomeFantasia || c.razaoSocial),
          vendedor: nomeDe.get(String(c.vendedorId)) ?? '',
          ultimaCompra: c.ultimaCompra
            ? new Date(String(c.ultimaCompra)).toISOString().slice(0, 10)
            : null,
          semCompra: c.semCompra ? 1 : 0,
          semAplicaveis: c.semAplicaveis ? 1 : 0,
        }));
      return {
        periodoDias: dias,
        nota: `Janela fixa de ${dias} dias (a mesma do aviso "sem consumo" da Posição de Cliente). "Sem compra" = nenhuma nota de venda do cliente na janela; "sem aplicáveis" = não comprou nenhum produto aplicável aos equipamentos que ele tem.`,
        linhas: lista,
        total: this.somar(lista, ['comComodato', 'semCompra', 'semAplicaveis']),
        detalhe,
      };
    });
  }
}

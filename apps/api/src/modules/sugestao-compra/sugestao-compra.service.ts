import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import { ParametrosService } from '../parametros/parametros.service';
import type {
  ClienteSemelhante,
  ProdutoSugerido,
  SugestaoCompraQuery,
  SugestaoCompraResultado,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * O que conta como venda — a mesma definição das Consultas e da Posição de
 * Cliente: nota ativa, fora de comodato e do tipo Normal. Devolução e remessa
 * não são compra e não podem virar sinal de afinidade.
 */
const NOTA_DE_VENDA = Prisma.sql`n."deletedAt" IS NULL AND n."ativo" = true AND n."comodato" = false AND n."tipo" = 'N'`;

interface LinhaSemelhante {
  clienteId: string;
  razaoSocial: string;
  codigoErp: string | null;
  municipio: string | null;
  uf: string | null;
  produtosEmComum: number;
  tamanhoCesta: number;
  cnaesEmComum: number;
  mesmoCnaePrincipal: boolean;
  mesmaRegiao: boolean;
}

interface LinhaProduto {
  produtoId: string;
  codigoErp: string;
  descricao: string;
  clientes: number;
  valorTotal: number;
  ultimaCompra: Date | null;
  evidencia: string[];
}

/**
 * Sugestão de compra por afinidade entre clientes.
 *
 * A pergunta que responde: *"clientes parecidos com este compram alguma coisa
 * que ele não compra?"* — que é a conversa de cross-sell que o vendedor já tenta
 * fazer de cabeça, só que sobre 800 clientes e milhares de produtos.
 *
 * Tudo roda dentro do escopo de carteira do usuário: um vendedor nunca recebe
 * sugestão embasada em cliente de outra equipe, nem descobre por tabela que
 * eles existem.
 */
@Injectable()
export class SugestaoCompraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
  ) {}

  async paraCliente(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
    query: SugestaoCompraQuery,
  ): Promise<SugestaoCompraResultado> {
    return this.prisma.withTenant(
      empresaId,
      async (tx) => {
        const escopo = await resolverEscopoVendedores(tx, empresaId, user);

        const alvo = await tx.cliente.findFirst({
          where: {
            id: clienteId,
            empresaId,
            deletedAt: null,
            ...(escopo ? { vendedorId: { in: escopo } } : {}),
          },
          select: {
            id: true,
            razaoSocial: true,
            municipio: true,
            uf: true,
            tabelaPrecoId: true,
          },
        });
        if (!alvo) throw new NotFoundException('Cliente não encontrado');

        const meses = await this.parametros.obterNumero(
          empresaId,
          'SUGESTAO_COMPRA_MESES',
          query.meses,
          tx,
        );
        const desde = new Date();
        desde.setMonth(desde.getMonth() - meses);

        const cnaesAlvo = await tx.clienteCnae.findMany({
          where: { empresaId, clienteId, deletedAt: null },
          include: { cnae: { select: { codigoErp: true, descricao: true } } },
          orderBy: { principal: 'desc' },
        });

        const cestaAlvo = await this.cestaDoCliente(
          tx,
          empresaId,
          clienteId,
          desde,
        );

        const vazio = (aviso: string): SugestaoCompraResultado => ({
          clienteId: alvo.id,
          razaoSocial: alvo.razaoSocial,
          produtosNaCesta: cestaAlvo.length,
          cnaes: cnaesAlvo.map(
            (c) => `${c.cnae.codigoErp ?? '—'} — ${c.cnae.descricao}`,
          ),
          clientesSemelhantes: [],
          sugestoes: [],
          aviso,
        });

        // Sem histórico não há cesta a comparar. Com só CNAE ainda daria para
        // sugerir o que o ramo compra — fica registrado como evolução; hoje o
        // motor precisa de pelo menos uma compra.
        if (cestaAlvo.length === 0) {
          return vazio(
            'Este cliente não tem compras no período — sem cesta para comparar. ' +
              'Aumente a janela de meses ou use a lista de mais vendidos do ramo.',
          );
        }

        const semelhantes = await this.buscarSemelhantes(tx, {
          empresaId,
          clienteId,
          escopo,
          desde,
          cestaAlvo,
          municipio: alvo.municipio,
          uf: alvo.uf,
          query,
        });

        if (semelhantes.length === 0) {
          return vazio(
            'Nenhum cliente semelhante encontrado na sua carteira dentro do período.',
          );
        }

        const produtos = await this.produtosDosSemelhantes(tx, {
          empresaId,
          desde,
          semelhantes: semelhantes.map((s) => s.clienteId),
          cestaAlvo,
          limite: query.limite,
        });

        if (produtos.length === 0) {
          return vazio(
            'Os clientes semelhantes não compram nada além do que este cliente já compra.',
          );
        }

        const precos = await this.precosNaTabelaDoCliente(
          tx,
          empresaId,
          alvo.tabelaPrecoId,
          produtos.map((p) => p.produtoId),
        );

        const total = semelhantes.length;
        const sugestoes: ProdutoSugerido[] = produtos.map((p) => {
          const cobertura = p.clientes / total;
          return {
            produtoId: p.produtoId,
            codigoErp: p.codigoErp,
            descricao: p.descricao,
            score: Math.round(cobertura * 100) / 100,
            semelhantesQueCompram: p.clientes,
            totalSemelhantes: total,
            cobertura: Math.round(cobertura * 100) / 100,
            valorMedio:
              Math.round((p.valorTotal / Math.max(p.clientes, 1)) * 100) / 100,
            ultimaCompraNoGrupo: p.ultimaCompra ?? null,
            precoTabelaCliente: precos.get(p.produtoId) ?? null,
            evidencia: p.evidencia,
          };
        }) as ProdutoSugerido[];

        return {
          clienteId: alvo.id,
          razaoSocial: alvo.razaoSocial,
          produtosNaCesta: cestaAlvo.length,
          cnaes: cnaesAlvo.map(
            (c) => `${c.cnae.codigoErp ?? '—'} — ${c.cnae.descricao}`,
          ),
          clientesSemelhantes: semelhantes,
          sugestoes,
          aviso: null,
        };
      },
      // A varredura de cesta cruza a maior tabela da base; o default de 5s do
      // Prisma é curto para carteiras grandes.
      { timeout: 30_000 },
    );
  }

  /** Produtos distintos que o cliente comprou no período. */
  private async cestaDoCliente(
    tx: TenantTx,
    empresaId: string,
    clienteId: string,
    desde: Date,
  ): Promise<string[]> {
    const linhas = await tx.$queryRaw<{ produtoId: string }[]>(Prisma.sql`
      SELECT DISTINCT i."produtoId"
      FROM "notas_saida_itens" i
      JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
      WHERE i."empresaId" = ${empresaId}
        AND i."clienteId" = ${clienteId}
        AND i."produtoId" IS NOT NULL
        AND i."deletedAt" IS NULL
        AND i."ativo" = true
        AND i."dtEmissao" >= ${desde}
        AND ${NOTA_DE_VENDA}
    `);
    return linhas.map((l) => l.produtoId);
  }

  /**
   * Top-K clientes mais parecidos. O teto de K não é enfeite: sem ele a
   * agregação de produtos varreria a carteira inteira para cada consulta.
   */
  private async buscarSemelhantes(
    tx: TenantTx,
    p: {
      empresaId: string;
      clienteId: string;
      escopo: string[] | null;
      desde: Date;
      cestaAlvo: string[];
      municipio: string | null;
      uf: string | null;
      query: SugestaoCompraQuery;
    },
  ): Promise<ClienteSemelhante[]> {
    const filtroEscopo =
      p.escopo === null
        ? Prisma.sql``
        : p.escopo.length > 0
          ? Prisma.sql`AND c."vendedorId" IN (${Prisma.join(p.escopo)})`
          : Prisma.sql`AND false`;

    const linhas = await tx.$queryRaw<LinhaSemelhante[]>(Prisma.sql`
      WITH cestas AS (
        SELECT i."clienteId", i."produtoId"
        FROM "notas_saida_itens" i
        JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
        JOIN "clientes" c ON c."id" = i."clienteId"
             AND c."deletedAt" IS NULL AND c."ativo" = true
        WHERE i."empresaId" = ${p.empresaId}
          AND i."clienteId" <> ${p.clienteId}
          AND i."produtoId" IS NOT NULL
          AND i."deletedAt" IS NULL
          AND i."ativo" = true
          AND i."dtEmissao" >= ${p.desde}
          AND ${NOTA_DE_VENDA}
          ${filtroEscopo}
        GROUP BY i."clienteId", i."produtoId"
      ),
      medidas AS (
        SELECT
          ct."clienteId",
          COUNT(*)::int AS "tamanhoCesta",
          COUNT(*) FILTER (
            WHERE ct."produtoId" = ANY(${p.cestaAlvo}::text[])
          )::int AS "produtosEmComum"
        FROM cestas ct
        GROUP BY ct."clienteId"
      ),
      cnae_alvo AS (
        SELECT "cnaeId", "principal"
        FROM "cliente_cnaes"
        WHERE "empresaId" = ${p.empresaId} AND "clienteId" = ${p.clienteId}
          AND "deletedAt" IS NULL
      ),
      cnae_medidas AS (
        SELECT
          cc."clienteId",
          COUNT(*)::int AS "cnaesEmComum",
          BOOL_OR(cc."principal" AND ca."principal") AS "mesmoCnaePrincipal"
        FROM "cliente_cnaes" cc
        JOIN cnae_alvo ca ON ca."cnaeId" = cc."cnaeId"
        WHERE cc."empresaId" = ${p.empresaId} AND cc."deletedAt" IS NULL
        GROUP BY cc."clienteId"
      )
      SELECT
        m."clienteId",
        c."razaoSocial",
        c."codigoErp",
        c."municipio",
        c."uf",
        m."produtosEmComum",
        m."tamanhoCesta",
        COALESCE(cm."cnaesEmComum", 0) AS "cnaesEmComum",
        COALESCE(cm."mesmoCnaePrincipal", false) AS "mesmoCnaePrincipal",
        (c."uf" IS NOT DISTINCT FROM ${p.uf}
         AND c."municipio" IS NOT DISTINCT FROM ${p.municipio}) AS "mesmaRegiao"
      FROM medidas m
      JOIN "clientes" c ON c."id" = m."clienteId"
      LEFT JOIN cnae_medidas cm ON cm."clienteId" = m."clienteId"
      -- Descarta quem não tem nenhuma afinidade: sem produto em comum e sem
      -- CNAE em comum não é "pouco parecido", é outro negócio.
      WHERE m."produtosEmComum" > 0 OR COALESCE(cm."cnaesEmComum", 0) > 0
    `);

    const tamanhoAlvo = p.cestaAlvo.length;
    const usaCesta = p.query.baseSemelhanca !== 'cnae';
    const usaCnae = p.query.baseSemelhanca !== 'cesta';

    return linhas
      .map((l) => {
        // Jaccard: interseção sobre união. Penaliza naturalmente o cliente
        // gigante que compra de tudo e por isso "parece" com todo mundo.
        const uniao = tamanhoAlvo + l.tamanhoCesta - l.produtosEmComum;
        const indiceCesta = uniao > 0 ? l.produtosEmComum / uniao : 0;

        // CNAE: satura em 3 compartilhados — do quarto em diante não diz mais
        // nada sobre o ramo.
        const afinidadeCnae = Math.min(l.cnaesEmComum, 3) / 3;
        const bonusPrincipal = l.mesmoCnaePrincipal ? 0.35 : 0;
        const scoreCnae = Math.min(afinidadeCnae * 0.65 + bonusPrincipal, 1);

        const score =
          (usaCesta ? indiceCesta * 0.6 : 0) +
          (usaCnae ? scoreCnae * 0.4 : 0) +
          // Região só desempata; não deve promover um cliente de outro ramo.
          (l.mesmaRegiao ? 0.05 : 0);

        return {
          clienteId: l.clienteId,
          razaoSocial: l.razaoSocial,
          codigoErp: l.codigoErp,
          municipio: l.municipio,
          uf: l.uf,
          score: Math.round(score * 100) / 100,
          indiceCesta: Math.round(indiceCesta * 100) / 100,
          cnaesEmComum: l.cnaesEmComum,
          mesmoCnaePrincipal: l.mesmoCnaePrincipal,
          mesmaRegiao: l.mesmaRegiao,
          produtosEmComum: l.produtosEmComum,
        };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, p.query.semelhantes);
  }

  /** Produtos comprados pelos semelhantes e ausentes da cesta do alvo. */
  private async produtosDosSemelhantes(
    tx: TenantTx,
    p: {
      empresaId: string;
      desde: Date;
      semelhantes: string[];
      cestaAlvo: string[];
      limite: number;
    },
  ): Promise<LinhaProduto[]> {
    return tx.$queryRaw<LinhaProduto[]>(Prisma.sql`
      SELECT
        pr."id"        AS "produtoId",
        pr."codigoErp" AS "codigoErp",
        pr."descricao" AS "descricao",
        COUNT(DISTINCT i."clienteId")::int AS "clientes",
        SUM(i."vlrTotal")::float8          AS "valorTotal",
        MAX(i."dtEmissao")                 AS "ultimaCompra",
        -- Os três primeiros nomes bastam como argumento de venda; a lista
        -- inteira só polui a tela.
        (ARRAY_AGG(DISTINCT c."razaoSocial"))[1:3] AS "evidencia"
      FROM "notas_saida_itens" i
      JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
      JOIN "produtos" pr ON pr."id" = i."produtoId"
           AND pr."deletedAt" IS NULL AND pr."ativo" = true
      JOIN "clientes" c ON c."id" = i."clienteId"
      WHERE i."empresaId" = ${p.empresaId}
        AND i."clienteId" IN (${Prisma.join(p.semelhantes)})
        AND i."produtoId" IS NOT NULL
        AND NOT (i."produtoId" = ANY(${p.cestaAlvo}::text[]))
        AND i."deletedAt" IS NULL
        AND i."ativo" = true
        AND i."dtEmissao" >= ${p.desde}
        AND ${NOTA_DE_VENDA}
      GROUP BY pr."id", pr."codigoErp", pr."descricao"
      -- Produto que só um semelhante compra é idiossincrasia dele, não padrão
      -- do grupo.
      HAVING COUNT(DISTINCT i."clienteId") > 1
      ORDER BY "clientes" DESC, "valorTotal" DESC
      LIMIT ${p.limite}
    `);
  }

  /**
   * Preço vigente na tabela do cliente-alvo. Sugerir sem preço obriga o
   * vendedor a abrir outra tela para saber por quanto vender.
   */
  private async precosNaTabelaDoCliente(
    tx: TenantTx,
    empresaId: string,
    tabelaPrecoId: string | null,
    produtoIds: string[],
  ): Promise<Map<string, number>> {
    const mapa = new Map<string, number>();
    if (!tabelaPrecoId || produtoIds.length === 0) return mapa;

    const itens = await tx.tabelaPrecoItem.findMany({
      where: {
        empresaId,
        tabelaPrecoId,
        produtoId: { in: produtoIds },
        deletedAt: null,
      },
      select: { produtoId: true, preco: true },
    });
    for (const item of itens) {
      if (item.produtoId) mapa.set(item.produtoId, item.preco);
    }
    return mapa;
  }
}

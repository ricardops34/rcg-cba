import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  Prisma,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  EquipamentoAplicacaoCriar,
  EquipamentoComodato,
  EquipamentoComodatoCriar,
  EquipamentoComodatoDetalhe,
  EquipamentoComodatoEditar,
  EquipamentoComodatoQuery,
  EquipamentoPopularResultado,
  EquipamentoSugestao,
} from '@plataforma/contracts';
import { ProdutoRelacionadosService } from '../produtos/produto-relacionados.service';
import { raizesDoEquipamento, raizesEmComum } from './descricao-parecida';

const PRODUTO_SELECT = {
  id: true,
  codigoErp: true,
  descricao: true,
  unidade: true,
  ativo: true,
  categoria: { select: { descricao: true } },
} satisfies Prisma.ProdutoSelect;

type ProdutoLido = Prisma.ProdutoGetPayload<{ select: typeof PRODUTO_SELECT }>;

const INCLUDE = {
  produto: {
    select: {
      ...PRODUTO_SELECT,
      _count: {
        select: { relacionados: { where: { tipo: 'aplicacao' as const } } },
      },
    },
  },
} satisfies Prisma.EquipamentoComodatoInclude;

type EquipamentoLido = Prisma.EquipamentoComodatoGetPayload<{
  include: typeof INCLUDE;
}>;

const ORDENACAO: Record<
  string,
  (o: Prisma.SortOrder) => Prisma.EquipamentoComodatoOrderByWithRelationInput
> = {
  descricao: (o) => ({ produto: { descricao: o } }),
  codigoErp: (o) => ({ produto: { codigoErp: o } }),
  createdAt: (o) => ({ createdAt: o }),
};

/** Sugestões: janela de compra e cortes medidos em 2026-10-07 (ver o plano). */
const SUGESTAO_MESES = 24;
const SUGESTAO_MIN_CLIENTES = 3;
const SUGESTAO_MIN_LIFT = 1.5;
const SUGESTAO_CANDIDATOS = 40;
const SUGESTAO_LIMITE = 20;

function produtoRef(p: ProdutoLido) {
  return {
    id: p.id,
    codigoErp: p.codigoErp,
    descricao: p.descricao,
    unidade: p.unidade,
    categoria: p.categoria?.descricao ?? null,
    ativo: p.ativo,
  };
}

/**
 * Equipamentos de comodato (ver docs/planos/equipamentos-comodato.md).
 *
 * O cabeçalho é `equipamentos_comodato`; os itens são a relação `aplicacao`
 * de `produto_relacionados`, gravada pelo mesmo service do card
 * "Relacionados" do produto — as duas telas editam o mesmo dado.
 */
@Injectable()
export class EquipamentosComodatoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relacionados: ProdutoRelacionadosService,
  ) {}

  findAll(empresaId: string, query: EquipamentoComodatoQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where: Prisma.EquipamentoComodatoWhereInput = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.semAplicacao
          ? { produto: { relacionados: { none: { tipo: 'aplicacao' } } } }
          : {}),
        ...(query.search
          ? {
              OR: [
                {
                  produto: {
                    descricao: { contains: query.search, mode: 'insensitive' },
                  },
                },
                {
                  produto: {
                    codigoErp: { contains: query.search, mode: 'insensitive' },
                  },
                },
              ],
            }
          : {}),
      };
      const ordenar = ORDENACAO[query.sortBy ?? ''] ?? ORDENACAO.descricao;
      const [linhas, total] = await Promise.all([
        tx.equipamentoComodato.findMany({
          where,
          include: INCLUDE,
          orderBy: ordenar(query.sortBy ? query.sortOrder : 'asc'),
          ...paginationToSkipTake(query),
        }),
        tx.equipamentoComodato.count({ where }),
      ]);
      const clientes = await this.clientesPorProduto(
        tx,
        empresaId,
        linhas.map((l) => l.produtoId),
      );
      return buildPaginatedResult(
        linhas.map((l) => this.paraLeitura(l, clientes.get(l.produtoId) ?? 0)),
        total,
        query,
      );
    });
  }

  findOne(empresaId: string, id: string): Promise<EquipamentoComodatoDetalhe> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const equipamento = await this.buscar(tx, empresaId, id);
      const [aplicacoes, clientes] = await Promise.all([
        tx.produtoRelacionado.findMany({
          where: {
            empresaId,
            produtoId: equipamento.produtoId,
            tipo: 'aplicacao',
          },
          include: { relacionado: { select: PRODUTO_SELECT } },
          orderBy: [{ ordem: 'asc' }, { relacionado: { descricao: 'asc' } }],
        }),
        this.clientesPorProduto(tx, empresaId, [equipamento.produtoId]),
      ]);
      return {
        ...this.paraLeitura(
          equipamento,
          clientes.get(equipamento.produtoId) ?? 0,
        ),
        aplicacoes: aplicacoes.map((a) => ({
          id: a.id,
          produto: produtoRef(a.relacionado),
          observacao: a.observacao,
        })),
      };
    });
  }

  /**
   * Cadastra o equipamento. Um produto excluído antes volta, com as
   * aplicações que tinha — elas nunca saíram de produto_relacionados.
   */
  create(empresaId: string, userId: string, input: EquipamentoComodatoCriar) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const produto = await tx.produto.findFirst({
        where: { id: input.produtoId, empresaId, deletedAt: null },
        select: { id: true },
      });
      if (!produto) throw new NotFoundException('Produto não encontrado');

      const existente = await tx.equipamentoComodato.findFirst({
        where: { empresaId, produtoId: input.produtoId },
      });
      if (existente && !existente.deletedAt) {
        throw new ConflictException(
          'Este produto já é um equipamento de comodato',
        );
      }
      const salvo = existente
        ? await tx.equipamentoComodato.update({
            where: { id: existente.id },
            data: {
              deletedAt: null,
              deletedBy: null,
              ativo: true,
              observacao: input.observacao ?? existente.observacao,
              updatedBy: userId,
            },
          })
        : await tx.equipamentoComodato.create({
            data: {
              empresaId,
              produtoId: input.produtoId,
              observacao: input.observacao ?? null,
              createdBy: userId,
              updatedBy: userId,
            },
          });
      return { id: salvo.id };
    });
  }

  update(
    empresaId: string,
    userId: string,
    id: string,
    input: EquipamentoComodatoEditar,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.buscar(tx, empresaId, id);
      await tx.equipamentoComodato.update({
        where: { id },
        data: {
          ...(input.observacao !== undefined
            ? { observacao: input.observacao }
            : {}),
          ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
          updatedBy: userId,
        },
      });
      return { id };
    });
  }

  /** Soft delete. As aplicações ficam: são do produto (ver o model). */
  remove(empresaId: string, userId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.buscar(tx, empresaId, id);
      await tx.equipamentoComodato.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: userId, updatedBy: userId },
      });
      return { ok: true };
    });
  }

  async adicionarAplicacao(
    empresaId: string,
    userId: string,
    id: string,
    input: EquipamentoAplicacaoCriar,
  ) {
    const equipamento = await this.prisma.withTenant(empresaId, (tx) =>
      this.buscar(tx, empresaId, id),
    );
    const relacao = await this.relacionados.criar(
      empresaId,
      userId,
      equipamento.produtoId,
      {
        relacionadoId: input.produtoId,
        tipo: 'aplicacao',
        observacao: input.observacao ?? null,
        ordem: 0,
      },
    );
    return { id: relacao.id };
  }

  /** Só a aplicação **deste** equipamento — o id da relação não basta. */
  removerAplicacao(empresaId: string, id: string, relacaoId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const equipamento = await this.buscar(tx, empresaId, id);
      const relacao = await tx.produtoRelacionado.findFirst({
        where: {
          id: relacaoId,
          empresaId,
          produtoId: equipamento.produtoId,
          tipo: 'aplicacao',
        },
        select: { id: true },
      });
      if (!relacao)
        throw new NotFoundException('Produto aplicável não encontrado');
      await tx.produtoRelacionado.delete({ where: { id: relacaoId } });
      return { ok: true };
    });
  }

  /**
   * Produtos que os clientes com este equipamento compram mais do que a média
   * (compra conjunta). Ver o plano: é sugestão para revisão, não verdade.
   *
   * Fica de fora o que já está cadastrado como aplicação e o que é, ele mesmo,
   * equipamento de comodato — o cliente com dispenser de toalha costuma ter o
   * de sabonete também, e isso não faz de um a aplicação do outro. Pelo mesmo
   * motivo sai o produto de categoria marcada como de equipamento, que a
   * gravação recusaria (ver ProdutoRelacionadosService).
   */
  sugestoes(empresaId: string, id: string): Promise<EquipamentoSugestao[]> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const equipamento = await this.buscar(tx, empresaId, id);
      const desde = new Date();
      desde.setUTCMonth(desde.getUTCMonth() - SUGESTAO_MESES);

      const linhas = await tx.$queryRaw<
        {
          produtoId: string;
          comEquipamento: number;
          totalComEquipamento: number;
          geral: number;
          totalGeral: number;
        }[]
      >`
        WITH cli_eq AS (
          SELECT DISTINCT i."clienteId"
            FROM "notas_saida_itens" i
           WHERE i."empresaId" = ${empresaId}
             AND i."produtoId" = ${equipamento.produtoId}
             AND i."comodato" = true
             AND i."deletedAt" IS NULL
             AND i."clienteId" IS NOT NULL
        ), venda AS (
          SELECT DISTINCT i."clienteId", i."produtoId"
            FROM "notas_saida_itens" i
            JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
           WHERE i."empresaId" = ${empresaId}
             AND n."tipo" = 'N' AND n."geraDuplicata" = true AND n."comodato" = false
             AND n."ativo" = true AND n."deletedAt" IS NULL
             AND i."ativo" = true AND i."deletedAt" IS NULL AND i."comodato" = false
             AND i."produtoId" IS NOT NULL AND i."clienteId" IS NOT NULL
             AND i."dtEmissao" >= ${desde}
        ), totais AS (
          SELECT (SELECT COUNT(DISTINCT "clienteId") FROM venda) AS "geral",
                 (SELECT COUNT(*) FROM cli_eq c
                   WHERE EXISTS (SELECT 1 FROM venda v WHERE v."clienteId" = c."clienteId")) AS "comEq"
        ), agrupado AS (
          SELECT v."produtoId",
                 COUNT(*) FILTER (WHERE v."clienteId" IN (SELECT "clienteId" FROM cli_eq)) AS "comEquipamento",
                 COUNT(*) AS "geral"
            FROM venda v
           GROUP BY v."produtoId"
        )
        SELECT a."produtoId",
               a."comEquipamento"::int AS "comEquipamento",
               t."comEq"::int AS "totalComEquipamento",
               a."geral"::int AS "geral",
               t."geral"::int AS "totalGeral"
          FROM agrupado a CROSS JOIN totais t
         WHERE a."comEquipamento" >= ${SUGESTAO_MIN_CLIENTES}
           AND t."comEq" > 0
           AND a."comEquipamento"::float / t."comEq" > ${SUGESTAO_MIN_LIFT} * a."geral"::float / t."geral"
           AND a."produtoId" <> ${equipamento.produtoId}
           AND NOT EXISTS (
                 SELECT 1 FROM "produto_relacionados" r
                  WHERE r."empresaId" = ${empresaId} AND r."produtoId" = ${equipamento.produtoId}
                    AND r."relacionadoId" = a."produtoId" AND r."tipo" = 'aplicacao')
           AND NOT EXISTS (
                 SELECT 1 FROM "equipamentos_comodato" e
                  WHERE e."produtoId" = a."produtoId" AND e."deletedAt" IS NULL)
           AND NOT EXISTS (
                 SELECT 1 FROM "produtos" p
                   LEFT JOIN "categorias" c1 ON c1."id" = p."categoriaId"
                   LEFT JOIN "categorias" c2 ON c2."id" = p."subCategoriaId"
                  WHERE p."id" = a."produtoId"
                    AND (c1."equipamentoComodato" = true OR c2."equipamentoComodato" = true))
         ORDER BY a."comEquipamento" DESC
         LIMIT ${SUGESTAO_CANDIDATOS}`;
      if (linhas.length === 0) return [];

      const produtos = await tx.produto.findMany({
        where: { empresaId, id: { in: linhas.map((l) => l.produtoId) } },
        select: PRODUTO_SELECT,
      });
      const porId = new Map(produtos.map((p) => [p.id, p]));
      const raizes = raizesDoEquipamento(equipamento.produto.descricao);

      return (
        linhas
          .filter((l) => porId.has(l.produtoId))
          .map((l) => {
            const produto = porId.get(l.produtoId)!;
            const emComum = raizesEmComum(raizes, produto.descricao);
            return {
              emComum,
              sugestao: {
                produto: produtoRef(produto),
                clientesComEquipamento: l.comEquipamento,
                percentualComEquipamento:
                  (100 * l.comEquipamento) / l.totalComEquipamento,
                percentualGeral: (100 * l.geral) / l.totalGeral,
                descricaoParecida: emComum > 0,
              },
            };
          })
          // Mais palavras em comum primeiro (ver `raizesEmComum`), depois quem
          // mais clientes com o equipamento compram.
          .sort(
            (a, b) =>
              b.emComum - a.emComum ||
              b.sugestao.clientesComEquipamento -
                a.sugestao.clientesComEquipamento,
          )
          .slice(0, SUGESTAO_LIMITE)
          .map((s) => s.sugestao)
      );
    });
  }

  /**
   * "Popular pelas notas": cadastra como equipamento todo produto que já saiu
   * em remessa de comodato (item com CFOP 5908/6908). O que já está no
   * cadastro fica como está — inclusive o excluído: alguém o tirou de
   * propósito, e popular de novo não deve desfazer isso.
   */
  popular(
    empresaId: string,
    userId: string,
  ): Promise<EquipamentoPopularResultado> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const [{ total }] = await tx.$queryRaw<{ total: number }[]>`
        SELECT COUNT(DISTINCT i."produtoId")::int AS "total"
          FROM "notas_saida_itens" i
          JOIN "produtos" p ON p."id" = i."produtoId" AND p."deletedAt" IS NULL
         WHERE i."empresaId" = ${empresaId}
           AND i."comodato" = true
           AND i."deletedAt" IS NULL`;
      const criados = await tx.$executeRaw`
        INSERT INTO "equipamentos_comodato"
               ("id", "empresaId", "produtoId", "ativo", "createdAt", "updatedAt", "createdBy", "updatedBy")
        SELECT gen_random_uuid(), ${empresaId}, x."produtoId", true, now(), now(), ${userId}, ${userId}
          FROM (
            SELECT DISTINCT i."produtoId"
              FROM "notas_saida_itens" i
              JOIN "produtos" p ON p."id" = i."produtoId" AND p."deletedAt" IS NULL
             WHERE i."empresaId" = ${empresaId}
               AND i."comodato" = true
               AND i."deletedAt" IS NULL
          ) x
         WHERE NOT EXISTS (
                 SELECT 1 FROM "equipamentos_comodato" e WHERE e."produtoId" = x."produtoId")`;
      return { criados, existentes: total - criados };
    });
  }

  private async buscar(tx: TenantTx, empresaId: string, id: string) {
    const equipamento = await tx.equipamentoComodato.findFirst({
      where: { id, empresaId, deletedAt: null },
      include: INCLUDE,
    });
    if (!equipamento) {
      throw new NotFoundException('Equipamento de comodato não encontrado');
    }
    return equipamento;
  }

  /** Clientes que já receberam cada produto em remessa de comodato. */
  private async clientesPorProduto(
    tx: TenantTx,
    empresaId: string,
    produtoIds: string[],
  ): Promise<Map<string, number>> {
    if (produtoIds.length === 0) return new Map();
    const linhas = await tx.$queryRaw<{ produtoId: string; total: number }[]>`
      SELECT i."produtoId", COUNT(DISTINCT i."clienteId")::int AS "total"
        FROM "notas_saida_itens" i
       WHERE i."empresaId" = ${empresaId}
         AND i."produtoId" IN (${Prisma.join(produtoIds)})
         AND i."comodato" = true
         AND i."deletedAt" IS NULL
       GROUP BY i."produtoId"`;
    return new Map(linhas.map((l) => [l.produtoId, l.total]));
  }

  private paraLeitura(
    e: EquipamentoLido,
    totalClientes: number,
  ): EquipamentoComodato {
    return {
      id: e.id,
      produto: produtoRef(e.produto),
      observacao: e.observacao,
      ativo: e.ativo,
      totalAplicacoes: e.produto._count.relacionados,
      totalClientes,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type { EstoqueQuery } from '@plataforma/contracts';

const CATEGORIA_SELECT = { select: { id: true, descricao: true } };
const ARMAZEM_SELECT = { select: { id: true, codigoErp: true, descricao: true, ativo: true } };

// Consulta read-only: o saldo entra só pelo import do legado (e no futuro
// pela API externa de manutenção) — nada de create/update/delete manual.
//
// Só conta o estoque dos armazéns de revenda (MV_BJAPI16 no Protheus, marcado
// pelo ERP em armazem.revenda) — decisão de 29/09/2026, vale em toda leitura
// de estoque da plataforma.
//
// A listagem é por produto (um produto pode ter saldo em vários armazéns);
// o saldo apresentado é a soma em todos os armazéns, ou só no armazém
// filtrado quando query.armazemId é informado. O detalhamento por armazém
// fica na tela de visualização (findByProduto).
@Injectable()
export class EstoqueService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, query: EstoqueQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const estoqueFilter: Prisma.EstoqueWhereInput = {
        empresaId,
        deletedAt: null,
        ...(query.armazemId ? { armazemId: query.armazemId } : {}),
        AND: [{ armazem: { revenda: true } }],
        OR: [
          { armazem: { ativo: true } },
          { armazem: { ativo: false }, saldo: { gt: 0 } },
        ],
      };

      const estoqueComSaldoFilter: Prisma.EstoqueWhereInput = {
        ...estoqueFilter,
        saldo: { gt: 0 },
      };

      const where: Prisma.ProdutoWhereInput = {
        empresaId,
        deletedAt: null,
        // Regra de negócio: listar somente produtos de categorias usadas
        // (usado = true, marcação da plataforma) e ativas (status do ERP).
        categoria: {
          usado: true,
          ativo: true,
          ...(query.categoriaId ? { id: query.categoriaId } : {}),
        },
        // Regra de negócio: itens (produtos) inativos/bloqueados só aparecem se tiverem saldo (> 0)
        OR: [
          { ativo: true },
          {
            ativo: false,
            estoques: {
              some: estoqueComSaldoFilter,
            },
          },
        ],
        ...(query.search
          ? {
              AND: [
                {
                  OR: [
                    { descricao: { contains: query.search, mode: 'insensitive' as const } },
                    { codigoErp: { contains: query.search, mode: 'insensitive' as const } },
                  ],
                },
              ],
            }
          : {}),
        ...(query.comSaldo === false
          ? {
              estoques: {
                some: estoqueFilter,
                // "Toda linha que conta está zerada" — linha de armazém fora da
                // revenda (ou inativo sem saldo) não entra na conta.
                every: { OR: [{ NOT: estoqueFilter }, { saldo: { lte: 0 } }] },
              },
            }
          : query.comSaldo === true
            ? { estoques: { some: { ...estoqueFilter, saldo: { gt: 0 } } } }
            : query.armazemId
              ? { estoques: { some: estoqueFilter } }
              : {}),
      };

      const orderBy: Prisma.ProdutoOrderByWithRelationInput =
        query.sortBy === 'categoria'
          ? { categoria: { descricao: query.sortOrder } }
          : query.sortBy === 'codigoErp'
            ? { codigoErp: query.sortOrder }
            : { descricao: query.sortOrder };

      // O saldo é agregado por produto: ordenar antes de paginar. Reutiliza
      // o filtro de produtos para preservar as regras de visibilidade.
      let idsOrdenados: string[] | undefined;
      if (query.sortBy === 'saldoTotal') {
        const candidatos = await tx.produto.findMany({ where, select: { id: true } });
        const { skip, take } = paginationToSkipTake(query);
        const direcao = query.sortOrder === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
        const ordenados = candidatos.length
          ? await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
              SELECT p.id
              FROM produtos p
              LEFT JOIN (
                SELECT e."produtoId", SUM(e.saldo) AS saldo
                FROM estoques e
                JOIN armazens a ON a.id = e."armazemId" AND a."empresaId" = e."empresaId"
                WHERE e."empresaId" = ${empresaId} AND e."deletedAt" IS NULL
                  AND a.revenda = true AND (a.ativo = true OR e.saldo > 0)
                  ${query.armazemId ? Prisma.sql`AND e."armazemId" = ${query.armazemId}` : Prisma.empty}
                GROUP BY e."produtoId"
              ) s ON s."produtoId" = p.id
              WHERE p."empresaId" = ${empresaId}
                AND p.id = ANY(${candidatos.map((p) => p.id)}::text[])
              ORDER BY COALESCE(s.saldo, 0) ${direcao}, p.id ASC
              LIMIT ${take} OFFSET ${skip}
            `)
          : [];
        idsOrdenados = ordenados.map((p) => p.id);
      }

      const [produtos, total] = await Promise.all([
        tx.produto.findMany({
          where: idsOrdenados ? { ...where, id: { in: idsOrdenados } } : where,
          include: { categoria: CATEGORIA_SELECT },
          ...(idsOrdenados ? {} : paginationToSkipTake(query)),
          orderBy,
        }),
        tx.produto.count({ where }),
      ]);

      if (idsOrdenados) {
        const posicoes = new Map(idsOrdenados.map((id, index) => [id, index]));
        produtos.sort((a, b) => posicoes.get(a.id)! - posicoes.get(b.id)!);
      }

      const produtoIds = produtos.map((p) => p.id);
      const somas = produtoIds.length
        ? await tx.estoque.groupBy({
            by: ['produtoId'],
            where: { produtoId: { in: produtoIds }, ...estoqueFilter },
            _sum: { saldo: true, reserva: true },
            _max: { ultimaCompra: true },
            _count: { _all: true },
          })
        : [];
      const somaPorProduto = new Map(somas.map((s) => [s.produtoId, s]));

      const data = produtos.map((p) => {
        const soma = somaPorProduto.get(p.id);
        return {
          id: p.id,
          codigoErp: p.codigoErp,
          descricao: p.descricao,
          unidade: p.unidade,
          categoria: p.categoria,
          saldoTotal: soma?._sum.saldo ?? 0,
          reservaTotal: soma?._sum.reserva ?? null,
          qtdArmazens: soma?._count._all ?? 0,
          ultimaCompra: soma?._max.ultimaCompra ?? null,
          ativo: p.ativo,
        };
      });

      return buildPaginatedResult(data, total, query);
    });
  }

  async findByProduto(empresaId: string, produtoId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const produto = await tx.produto.findFirst({
        where: { id: produtoId, empresaId, deletedAt: null },
        include: { categoria: CATEGORIA_SELECT },
      });
      if (!produto) throw new NotFoundException('Produto não encontrado');

      const saldos = await tx.estoque.findMany({
        where: {
          produtoId,
          empresaId,
          deletedAt: null,
          AND: [{ armazem: { revenda: true } }],
          OR: [
            { armazem: { ativo: true } },
            { armazem: { ativo: false }, saldo: { gt: 0 } },
          ],
        },
        include: { armazem: ARMAZEM_SELECT },
        orderBy: { armazem: { descricao: 'asc' } },
      });

      if (!produto.ativo) {
        const temSaldo = saldos.some((s) => s.saldo > 0);
        if (!temSaldo) {
          throw new NotFoundException('Produto não encontrado');
        }
      }

      return {
        produto: {
          id: produto.id,
          codigoErp: produto.codigoErp,
          descricao: produto.descricao,
          unidade: produto.unidade,
          categoria: produto.categoria,
          ativo: produto.ativo,
        },
        saldos,
      };
    });
  }
}

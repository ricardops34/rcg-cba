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
        // Regra de negócio: listar somente produtos de categorias usadas (usado = true)
        categoria: {
          usado: true,
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
          ? { estoques: { some: estoqueFilter, every: { ...estoqueFilter, saldo: { lte: 0 } } } }
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

      const [produtos, total] = await Promise.all([
        tx.produto.findMany({
          where,
          include: { categoria: CATEGORIA_SELECT },
          ...paginationToSkipTake(query),
          orderBy,
        }),
        tx.produto.count({ where }),
      ]);

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

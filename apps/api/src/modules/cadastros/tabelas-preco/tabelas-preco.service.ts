import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type {
  TabelaPrecoItemQuery,
  TabelaPrecoQuery,
} from '@plataforma/contracts';

const SORT_FIELDS = new Set([
  'codigoErp',
  'descricao',
  'dtInicio',
  'dtFim',
  'ativo',
  'createdAt',
]);
const ITEM_SORT_FIELDS = new Set([
  'preco',
  'ativo',
  'createdAt',
  'codigoErp',
  'descricao',
  'unidade',
]);
// Colunas do produto (relação) — Prisma ordena via orderBy aninhado
// (orderBy: { produto: { campo: ordem } }), diferente das colunas próprias
// do item.
const ITEM_SORT_RELATION_FIELDS = new Set(['codigoErp', 'descricao', 'unidade']);

const PRODUTO_SELECT = {
  select: { id: true, codigoErp: true, descricao: true, unidade: true },
};

// Regra de desconto do item (SZ0), pra tela exibir sem segundo fetch.
const REGRA_DESCONTO_SELECT = {
  select: { id: true, codigoErp: true, descricao: true },
};

@Injectable()
export class TabelasPrecoService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, query: TabelaPrecoQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  descricao: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  codigoErp: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      };
      const sortField =
        query.sortBy && SORT_FIELDS.has(query.sortBy)
          ? query.sortBy
          : 'descricao';
      const [data, total] = await Promise.all([
        tx.tabelaPreco.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.tabelaPreco.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const tabela = await tx.tabelaPreco.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!tabela)
        throw new NotFoundException('Tabela de preço não encontrada');
      return tabela;
    });
  }

  findAllItens(
    empresaId: string,
    tabelaPrecoId: string,
    query: TabelaPrecoItemQuery,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const tabela = await tx.tabelaPreco.findFirst({
        where: { id: tabelaPrecoId, empresaId, deletedAt: null },
      });
      if (!tabela)
        throw new NotFoundException('Tabela de preço não encontrada');

      const where = {
        empresaId,
        tabelaPrecoId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.search
          ? {
              produto: {
                OR: [
                  {
                    descricao: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    codigoErp: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
            }
          : {}),
      };
      const sortField =
        query.sortBy && ITEM_SORT_FIELDS.has(query.sortBy)
          ? query.sortBy
          : 'createdAt';
      const orderBy = ITEM_SORT_RELATION_FIELDS.has(sortField)
        ? { produto: { [sortField]: query.sortOrder } }
        : { [sortField]: query.sortOrder };
      const [data, total] = await Promise.all([
        tx.tabelaPrecoItem.findMany({
          where,
          include: {
            produto: PRODUTO_SELECT,
            regraDesconto: REGRA_DESCONTO_SELECT,
          },
          ...paginationToSkipTake(query),
          orderBy,
        }),
        tx.tabelaPrecoItem.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }
}

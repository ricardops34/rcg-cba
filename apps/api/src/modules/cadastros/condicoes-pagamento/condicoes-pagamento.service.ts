import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type { CondicaoPagamentoQuery } from '@plataforma/contracts';

const SORT_FIELDS = new Set([
  'descricao',
  'codigoErp',
  'forma',
  'ativo',
  'createdAt',
]);

@Injectable()
export class CondicoesPagamentoService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, query: CondicaoPagamentoQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.forma ? { forma: query.forma } : {}),
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
        tx.condicaoPagamento.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.condicaoPagamento.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const condicao = await tx.condicaoPagamento.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!condicao)
        throw new NotFoundException('Condição de pagamento não encontrada');
      return condicao;
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type { CategoriaQuery } from '@plataforma/contracts';

const SORT_FIELDS = new Set([
  'descricao',
  'codigoErp',
  'ativo',
  'usado',
  'categoriaPaiId',
  'createdAt',
]);

const PAI_SELECT = { select: { id: true, codigoErp: true, descricao: true } };

@Injectable()
export class CategoriasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, query: CategoriaQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.usado !== undefined ? { usado: query.usado } : {}),
        ...(query.raiz ? { categoriaPaiId: null } : {}),
        ...(query.categoriaPaiId
          ? { categoriaPaiId: query.categoriaPaiId }
          : {}),
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
        tx.categoria.findMany({
          where,
          include: { categoriaPai: PAI_SELECT },
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.categoria.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const categoria = await tx.categoria.findFirst({
        where: { id, empresaId, deletedAt: null },
        include: { categoriaPai: PAI_SELECT },
      });
      if (!categoria) throw new NotFoundException('Categoria não encontrada');
      return categoria;
    });
  }
}

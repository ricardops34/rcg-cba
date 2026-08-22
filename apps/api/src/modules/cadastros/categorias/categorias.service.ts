import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type { CategoriaQuery, CategoriaUpdate } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set([
  'descricao',
  'codigoErp',
  'ativo',
  'usado',
  'categoriaPaiId',
  'createdAt',
]);

const PAI_SELECT = { select: { id: true, codigoErp: true, descricao: true } };

// Regra de desconto vinculada (SZ0), pra tela exibir sem segundo fetch.
const REGRA_DESCONTO_SELECT = {
  select: { id: true, codigoErp: true, descricao: true },
};


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
        // `raiz` é tri-estado: true = só categoria (sem pai), false = só
        // subcategoria, omitido = as duas. Antes o `false` era ignorado, e o
        // filtro da tela só conseguia oferecer duas das três opções.
        ...(query.raiz === true ? { categoriaPaiId: null } : {}),
        ...(query.raiz === false ? { categoriaPaiId: { not: null } } : {}),
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
          include: {
            categoriaPai: PAI_SELECT,
            regraDesconto: REGRA_DESCONTO_SELECT,
          },
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
        include: {
            categoriaPai: PAI_SELECT,
            regraDesconto: REGRA_DESCONTO_SELECT,
          },
      });
      if (!categoria) throw new NotFoundException('Categoria não encontrada');
      return categoria;
    });
  }

  /**
   * Marca (ou desmarca) a categoria como "usada".
   *
   * É o único campo que esta API grava: o resto do cadastro vem do import. E é
   * por isso que o import **deixou de sobrescrever `usado`** ao atualizar (ver
   * `prisma/import-auxiliares.ts`) — sem essa mudança, a marcação feita aqui
   * seria desfeita na próxima carga da base legada.
   *
   * `null` é estado legítimo, e não "sem valor": é como nasce a subcategoria.
   */
  async update(empresaId: string, user: AuthenticatedUser, id: string, dto: CategoriaUpdate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existe = await tx.categoria.findFirst({
        where: { id, empresaId, deletedAt: null },
        select: { id: true },
      });
      if (!existe) throw new NotFoundException('Categoria não encontrada');

      return tx.categoria.update({
        where: { id },
        data: { usado: dto.usado, updatedBy: user.id },
        include: {
          categoriaPai: PAI_SELECT,
          regraDesconto: REGRA_DESCONTO_SELECT,
        },
      });
    });
  }
}

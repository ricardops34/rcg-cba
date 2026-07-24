import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, type TenantTx } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type {
  CategoriaCreate,
  CategoriaQuery,
  CategoriaUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set(['descricao', 'codigoErp', 'ativo', 'createdAt']);

const PAI_SELECT = { select: { id: true, codigoErp: true, descricao: true } };

@Injectable()
export class CategoriasService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  // Hierarquia limitada a 2 níveis (categoria/subcategoria), espelhando o
  // legado: o pai precisa ser uma categoria raiz.
  private async validarPai(
    tx: TenantTx,
    empresaId: string,
    categoriaPaiId: string | null | undefined,
    idAtual?: string,
  ) {
    if (!categoriaPaiId) return;
    if (idAtual && categoriaPaiId === idAtual) {
      throw new BadRequestException('Uma categoria não pode ser pai de si mesma');
    }
    const pai = await tx.categoria.findFirst({
      where: { id: categoriaPaiId, empresaId, deletedAt: null },
    });
    if (!pai) throw new BadRequestException('Categoria pai não encontrada');
    if (pai.categoriaPaiId) {
      throw new BadRequestException('Subcategoria não pode ter subcategorias (máximo de dois níveis)');
    }
  }

  findAll(empresaId: string, query: CategoriaQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.usado !== undefined ? { usado: query.usado } : {}),
        ...(query.raiz ? { categoriaPaiId: null } : {}),
        ...(query.categoriaPaiId ? { categoriaPaiId: query.categoriaPaiId } : {}),
        ...(query.search
          ? {
              OR: [
                { descricao: { contains: query.search, mode: 'insensitive' as const } },
                { codigoErp: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };
      const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'descricao';
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

  create(empresaId: string, user: AuthenticatedUser, input: CategoriaCreate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.validarPai(tx, empresaId, input.categoriaPaiId);
      return tx.categoria.create({
        data: {
          ...(this.limpar(input) as object),
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
        } as never,
      });
    });
  }

  async update(empresaId: string, user: AuthenticatedUser, id: string, input: CategoriaUpdate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const categoria = await tx.categoria.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!categoria) throw new NotFoundException('Categoria não encontrada');
      await this.validarPai(tx, empresaId, input.categoriaPaiId, id);
      return tx.categoria.update({
        where: { id },
        data: { ...(this.limpar(input) as object), updatedBy: user.id } as never,
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const categoria = await tx.categoria.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!categoria) throw new NotFoundException('Categoria não encontrada');
      const subcategorias = await tx.categoria.count({
        where: { empresaId, categoriaPaiId: id, deletedAt: null },
      });
      if (subcategorias > 0) {
        throw new BadRequestException('Exclua ou mova as subcategorias antes de excluir a categoria');
      }
      return tx.categoria.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }
}

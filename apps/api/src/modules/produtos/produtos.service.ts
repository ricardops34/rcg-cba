import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  PaginationQuery,
  ProdutoCreate,
  ProdutoUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class ProdutosService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    // Campos string vazios do formulário viram null no banco.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  findAll(empresaId: string, query: PaginationQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.search
          ? {
              OR: [
                { descricao: { contains: query.search, mode: 'insensitive' as const } },
                { codigoErp: { contains: query.search, mode: 'insensitive' as const } },
                { marca: { contains: query.search, mode: 'insensitive' as const } },
                { categoria: { contains: query.search, mode: 'insensitive' as const } },
                { codigoBarras: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.produto.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { descricao: 'asc' },
        }),
        tx.produto.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  create(empresaId: string, user: AuthenticatedUser, input: ProdutoCreate) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.produto.create({
        data: {
          ...(this.limpar(input) as object),
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
        } as never,
      }),
    );
  }

  async update(empresaId: string, user: AuthenticatedUser, id: string, input: ProdutoUpdate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const produto = await tx.produto.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!produto) throw new NotFoundException('Produto não encontrado');
      return tx.produto.update({
        where: { id },
        data: { ...(this.limpar(input) as object), updatedBy: user.id } as never,
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const produto = await tx.produto.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!produto) throw new NotFoundException('Produto não encontrado');
      return tx.produto.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }
}

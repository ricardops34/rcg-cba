import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type { ArmazemCreate, ArmazemQuery, ArmazemUpdate } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set(['descricao', 'codigoErp', 'ativo', 'createdAt']);

@Injectable()
export class ArmazensService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  findAll(empresaId: string, query: ArmazemQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
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
        tx.armazem.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.armazem.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const armazem = await tx.armazem.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!armazem) throw new NotFoundException('Armazém não encontrado');
      return armazem;
    });
  }

  create(empresaId: string, user: AuthenticatedUser, input: ArmazemCreate) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.armazem.create({
        data: {
          ...(this.limpar(input) as object),
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
        } as never,
      }),
    );
  }

  async update(empresaId: string, user: AuthenticatedUser, id: string, input: ArmazemUpdate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const armazem = await tx.armazem.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!armazem) throw new NotFoundException('Armazém não encontrado');
      return tx.armazem.update({
        where: { id },
        data: { ...(this.limpar(input) as object), updatedBy: user.id } as never,
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const armazem = await tx.armazem.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!armazem) throw new NotFoundException('Armazém não encontrado');
      return tx.armazem.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }
}

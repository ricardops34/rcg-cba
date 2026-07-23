import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  VendedorCreate,
  VendedorQuery,
  VendedorUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

// Campos que a listagem aceita ordenar por — whitelist pra não repassar
// direto pro Prisma um sortBy arbitrário vindo da query string.
const SORT_FIELDS = new Set(['nome', 'codigoErp', 'email', 'ativo', 'createdAt']);

@Injectable()
export class VendedoresService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    // Campos string vazios do formulário viram null no banco.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  findAll(empresaId: string, query: VendedorQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.vendedor !== undefined ? { vendedor: query.vendedor } : {}),
        ...(query.supervisor !== undefined ? { supervisor: query.supervisor } : {}),
        ...(query.gerente !== undefined ? { gerente: query.gerente } : {}),
        ...(query.desligado !== undefined ? { desligado: query.desligado } : {}),
        ...(query.supervisorId ? { supervisorId: query.supervisorId } : {}),
        ...(query.search
          ? {
              OR: [
                { nome: { contains: query.search, mode: 'insensitive' as const } },
                { codigoErp: { contains: query.search, mode: 'insensitive' as const } },
                { email: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };
      const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'nome';
      const [data, total] = await Promise.all([
        tx.vendedor.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.vendedor.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
      return vendedor;
    });
  }

  create(empresaId: string, user: AuthenticatedUser, input: VendedorCreate) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.vendedor.create({
        data: {
          ...(this.limpar(input) as object),
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
        } as never,
      }),
    );
  }

  async update(empresaId: string, user: AuthenticatedUser, id: string, input: VendedorUpdate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
      return tx.vendedor.update({
        where: { id },
        data: { ...(this.limpar(input) as object), updatedBy: user.id } as never,
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
      return tx.vendedor.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }
}

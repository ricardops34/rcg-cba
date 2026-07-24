import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type { EstadoCreate, EstadoQuery, EstadoUpdate } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set(['sigla', 'descricao', 'codigoErp', 'ativo', 'createdAt']);

// Tabela de referência global (sem empresaId/RLS, como Modulo/Menu) —
// acesso direto via this.prisma, sem withTenant.
@Injectable()
export class EstadosService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  async findAll(query: EstadoQuery) {
    const where = {
      deletedAt: null,
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      ...(query.search
        ? {
            OR: [
              { sigla: { contains: query.search, mode: 'insensitive' as const } },
              { descricao: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'sigla';
    const [data, total] = await Promise.all([
      this.prisma.estado.findMany({
        where,
        ...paginationToSkipTake(query),
        orderBy: { [sortField]: query.sortOrder },
      }),
      this.prisma.estado.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query);
  }

  async findOne(id: string) {
    const estado = await this.prisma.estado.findFirst({ where: { id, deletedAt: null } });
    if (!estado) throw new NotFoundException('Estado não encontrado');
    return estado;
  }

  async create(user: AuthenticatedUser, input: EstadoCreate) {
    return this.prisma.estado.create({
      data: { ...(this.limpar(input) as object), createdBy: user.id, updatedBy: user.id } as never,
    });
  }

  async update(user: AuthenticatedUser, id: string, input: EstadoUpdate) {
    await this.findOne(id);
    return this.prisma.estado.update({
      where: { id },
      data: { ...(this.limpar(input) as object), updatedBy: user.id } as never,
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.findOne(id);
    return this.prisma.estado.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
    });
  }
}

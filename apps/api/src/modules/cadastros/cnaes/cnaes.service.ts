import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type { CnaeCreate, CnaeQuery, CnaeUpdate } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set(['descricao', 'codigoErp', 'secao', 'ativo', 'createdAt']);

// Tabela de referência global (sem empresaId/RLS, como Modulo/Menu).
@Injectable()
export class CnaesService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  async findAll(query: CnaeQuery) {
    const where = {
      deletedAt: null,
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      ...(query.search
        ? {
            OR: [
              { descricao: { contains: query.search, mode: 'insensitive' as const } },
              { codigoErp: { contains: query.search, mode: 'insensitive' as const } },
              { subclasse: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'descricao';
    const [data, total] = await Promise.all([
      this.prisma.cnae.findMany({
        where,
        ...paginationToSkipTake(query),
        orderBy: { [sortField]: query.sortOrder },
      }),
      this.prisma.cnae.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query);
  }

  async findOne(id: string) {
    const cnae = await this.prisma.cnae.findFirst({ where: { id, deletedAt: null } });
    if (!cnae) throw new NotFoundException('CNAE não encontrado');
    return cnae;
  }

  async create(user: AuthenticatedUser, input: CnaeCreate) {
    return this.prisma.cnae.create({
      data: { ...(this.limpar(input) as object), createdBy: user.id, updatedBy: user.id } as never,
    });
  }

  async update(user: AuthenticatedUser, id: string, input: CnaeUpdate) {
    await this.findOne(id);
    return this.prisma.cnae.update({
      where: { id },
      data: { ...(this.limpar(input) as object), updatedBy: user.id } as never,
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.findOne(id);
    return this.prisma.cnae.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
    });
  }
}

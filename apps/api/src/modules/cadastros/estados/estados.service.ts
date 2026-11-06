import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type { EstadoCreate, EstadoQuery, EstadoUpdate } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { criarOuReativar, gravarUnico, REATIVAR } from '../unicidade';

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
    const dados = this.limpar(input);
    const chave = dados.sigla ? { sigla: dados.sigla as string } : null;
    return criarOuReativar({
      achaExcluido: () =>
        chave
          ? this.prisma.estado.findFirst({
              where: { deletedAt: { not: null }, ...chave },
              select: { id: true },
            })
          : Promise.resolve(null),
      reativar: (id) =>
        this.prisma.estado.update({
          where: { id },
          data: { ...(dados as object), ...REATIVAR, updatedBy: user.id } as never,
        }),
      criar: () =>
        this.prisma.estado.create({
          data: { ...(dados as object), createdBy: user.id, updatedBy: user.id } as never,
        }),
      jaExiste: 'Já existe um estado com esta sigla',
    });
  }

  async update(user: AuthenticatedUser, id: string, input: EstadoUpdate) {
    await this.findOne(id);
    return gravarUnico(
      () =>
        this.prisma.estado.update({
          where: { id },
          data: { ...(this.limpar(input) as object), updatedBy: user.id } as never,
        }),
      'Já existe um estado com esta sigla',
    );
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.findOne(id);
    return this.prisma.estado.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
    });
  }
}

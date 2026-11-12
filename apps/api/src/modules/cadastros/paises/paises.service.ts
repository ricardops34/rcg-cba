import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type { PaisCreate, PaisQuery, PaisUpdate } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { criarOuReativar, gravarUnico, REATIVAR } from '../unicidade';

const SORT_FIELDS = new Set(['nome', 'sigla', 'codigoErp', 'ativo', 'createdAt']);

// Tabela de referência global (sem empresaId/RLS, como Modulo/Menu).
@Injectable()
export class PaisesService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  async findAll(query: PaisQuery) {
    const where = {
      deletedAt: null,
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      ...(query.search
        ? {
            OR: [
              { nome: { contains: query.search, mode: 'insensitive' as const } },
              { sigla: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'nome';
    const [data, total] = await Promise.all([
      this.prisma.pais.findMany({
        where,
        ...paginationToSkipTake(query),
        orderBy: { [sortField]: query.sortOrder },
      }),
      this.prisma.pais.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query);
  }

  async findOne(id: string) {
    const pais = await this.prisma.pais.findFirst({ where: { id, deletedAt: null } });
    if (!pais) throw new NotFoundException('País não encontrado');
    return pais;
  }

  async create(user: AuthenticatedUser, input: PaisCreate) {
    const dados = this.limpar(input);
    const chave = dados.codigoErp ? { codigoErp: dados.codigoErp as string } : null;
    return criarOuReativar({
      achaExcluido: () =>
        chave
          ? this.prisma.pais.findFirst({
              where: { deletedAt: { not: null }, ...chave },
              select: { id: true },
            })
          : Promise.resolve(null),
      reativar: (id) =>
        this.prisma.pais.update({
          where: { id },
          data: { ...(dados as object), ...REATIVAR, updatedBy: user.id } as never,
        }),
      criar: () =>
        this.prisma.pais.create({
          data: { ...(dados as object), createdBy: user.id, updatedBy: user.id } as never,
        }),
      jaExiste: 'Já existe um país com este código',
    });
  }

  async update(user: AuthenticatedUser, id: string, input: PaisUpdate) {
    await this.findOne(id);
    return gravarUnico(
      () =>
        this.prisma.pais.update({
          where: { id },
          data: { ...(this.limpar(input) as object), updatedBy: user.id } as never,
        }),
      'Já existe um país com este código',
    );
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.findOne(id);
    return this.prisma.pais.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
    });
  }
}

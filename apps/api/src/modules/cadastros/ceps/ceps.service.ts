import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type { CepCreate, CepQuery, CepUpdate } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set(['cep', 'endereco', 'bairro', 'ativo', 'createdAt']);

const ESTADO_SELECT = { select: { id: true, sigla: true } };
const MUNICIPIO_SELECT = { select: { id: true, descricao: true } };

// Tabela de referência global (sem empresaId/RLS, como Modulo/Menu).
@Injectable()
export class CepsService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  async findAll(query: CepQuery) {
    const where = {
      deletedAt: null,
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      ...(query.estadoId ? { estadoId: query.estadoId } : {}),
      ...(query.municipioId ? { municipioId: query.municipioId } : {}),
      ...(query.search
        ? {
            OR: [
              { cep: { contains: query.search, mode: 'insensitive' as const } },
              { endereco: { contains: query.search, mode: 'insensitive' as const } },
              { bairro: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'cep';
    const [data, total] = await Promise.all([
      this.prisma.cep.findMany({
        where,
        include: { estado: ESTADO_SELECT, municipio: MUNICIPIO_SELECT },
        ...paginationToSkipTake(query),
        orderBy: { [sortField]: query.sortOrder },
      }),
      this.prisma.cep.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query);
  }

  async findOne(id: string) {
    const cep = await this.prisma.cep.findFirst({
      where: { id, deletedAt: null },
      include: { estado: ESTADO_SELECT, municipio: MUNICIPIO_SELECT },
    });
    if (!cep) throw new NotFoundException('CEP não encontrado');
    return cep;
  }

  async create(user: AuthenticatedUser, input: CepCreate) {
    return this.prisma.cep.create({
      data: { ...(this.limpar(input) as object), createdBy: user.id, updatedBy: user.id } as never,
    });
  }

  async update(user: AuthenticatedUser, id: string, input: CepUpdate) {
    const cep = await this.prisma.cep.findFirst({ where: { id, deletedAt: null } });
    if (!cep) throw new NotFoundException('CEP não encontrado');
    return this.prisma.cep.update({
      where: { id },
      data: { ...(this.limpar(input) as object), updatedBy: user.id } as never,
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    const cep = await this.prisma.cep.findFirst({ where: { id, deletedAt: null } });
    if (!cep) throw new NotFoundException('CEP não encontrado');
    return this.prisma.cep.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
    });
  }
}

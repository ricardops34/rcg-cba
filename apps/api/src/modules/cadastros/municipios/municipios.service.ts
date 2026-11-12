import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type { MunicipioCreate, MunicipioQuery, MunicipioUpdate } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { criarOuReativar, gravarUnico, REATIVAR } from '../unicidade';

const SORT_FIELDS = new Set(['descricao', 'codigoErp', 'codigoIbge', 'ativo', 'createdAt']);

const ESTADO_SELECT = { select: { id: true, sigla: true, descricao: true } };

// Tabela de referência global (sem empresaId/RLS, como Modulo/Menu).
@Injectable()
export class MunicipiosService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  async findAll(query: MunicipioQuery) {
    const where = {
      deletedAt: null,
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      ...(query.estadoId ? { estadoId: query.estadoId } : {}),
      ...(query.search
        ? {
            OR: [
              { descricao: { contains: query.search, mode: 'insensitive' as const } },
              { codigoIbge: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'descricao';
    const [data, total] = await Promise.all([
      this.prisma.municipio.findMany({
        where,
        include: { estado: ESTADO_SELECT },
        ...paginationToSkipTake(query),
        orderBy: { [sortField]: query.sortOrder },
      }),
      this.prisma.municipio.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query);
  }

  async findOne(id: string) {
    const municipio = await this.prisma.municipio.findFirst({
      where: { id, deletedAt: null },
      include: { estado: ESTADO_SELECT },
    });
    if (!municipio) throw new NotFoundException('Município não encontrado');
    return municipio;
  }

  async create(user: AuthenticatedUser, input: MunicipioCreate) {
    const dados = this.limpar(input);
    const chave = dados.codigoErp || dados.codigoIbge ? { OR: [...(dados.codigoErp ? [{ codigoErp: dados.codigoErp as string }] : []), ...(dados.codigoIbge ? [{ codigoIbge: dados.codigoIbge as string }] : [])] } : null;
    return criarOuReativar({
      achaExcluido: () =>
        chave
          ? this.prisma.municipio.findFirst({
              where: { deletedAt: { not: null }, ...chave },
              select: { id: true },
            })
          : Promise.resolve(null),
      reativar: (id) =>
        this.prisma.municipio.update({
          where: { id },
          data: { ...(dados as object), ...REATIVAR, updatedBy: user.id } as never,
        }),
      criar: () =>
        this.prisma.municipio.create({
          data: { ...(dados as object), createdBy: user.id, updatedBy: user.id } as never,
        }),
      jaExiste: 'Já existe um município com este código ou código IBGE',
    });
  }

  async update(user: AuthenticatedUser, id: string, input: MunicipioUpdate) {
    const municipio = await this.prisma.municipio.findFirst({ where: { id, deletedAt: null } });
    if (!municipio) throw new NotFoundException('Município não encontrado');
    return gravarUnico(
      () =>
        this.prisma.municipio.update({
          where: { id },
          data: { ...(this.limpar(input) as object), updatedBy: user.id } as never,
        }),
      'Já existe um município com este código ou código IBGE',
    );
  }

  async remove(user: AuthenticatedUser, id: string) {
    const municipio = await this.prisma.municipio.findFirst({ where: { id, deletedAt: null } });
    if (!municipio) throw new NotFoundException('Município não encontrado');
    return this.prisma.municipio.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
    });
  }
}

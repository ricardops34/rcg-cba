import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  ColaboradorCreate,
  ColaboradorUpdate,
  PaginationQuery,
} from '@plataforma/contracts';

@Injectable()
export class ColaboradoresService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, query: PaginationQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.search
          ? { usuario: { nome: { contains: query.search, mode: 'insensitive' as const } } }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.colaborador.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { createdAt: query.sortOrder },
          include: {
            usuario: { select: { id: true, nome: true, email: true, avatarUrl: true } },
            superior: {
              include: { usuario: { select: { nome: true } } },
            },
          },
        }),
        tx.colaborador.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const colaborador = await tx.colaborador.findFirst({
        where: { id, empresaId, deletedAt: null },
        include: {
          usuario: { select: { id: true, nome: true, email: true, avatarUrl: true } },
          superior: { include: { usuario: { select: { nome: true } } } },
          liderados: { include: { usuario: { select: { nome: true } } } },
        },
      });
      if (!colaborador) throw new NotFoundException('Colaborador não encontrado');
      return colaborador;
    });
  }

  create(empresaId: string, input: ColaboradorCreate, actorId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.colaborador.create({
        data: {
          empresaId,
          usuarioId: input.usuarioId,
          superiorId: input.superiorId,
          cargo: input.cargo,
          codigoErp: input.codigoErp,
          nomeReduzido: input.nomeReduzido,
          ativo: input.ativo,
          createdBy: actorId,
          updatedBy: actorId,
        },
        include: { usuario: { select: { nome: true, email: true } } },
      }),
    );
  }

  async update(
    empresaId: string,
    id: string,
    input: ColaboradorUpdate,
    actorId: string,
  ) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.colaborador.update({
        where: { id },
        data: { ...input, updatedBy: actorId },
      }),
    );
  }

  async remove(empresaId: string, id: string, actorId: string) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.colaborador.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: actorId, ativo: false },
      }),
    );
  }
}

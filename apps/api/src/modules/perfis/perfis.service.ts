import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  PaginationQuery,
  PerfilCreate,
  PerfilPermissoesUpdate,
  PerfilUpdate,
} from '@plataforma/contracts';

@Injectable()
export class PerfisService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, query: PaginationQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.search
          ? { nome: { contains: query.search, mode: 'insensitive' as const } }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.perfil.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { [query.sortBy ?? 'nome']: query.sortOrder },
        }),
        tx.perfil.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const perfil = await tx.perfil.findFirst({
        where: { id, empresaId, deletedAt: null },
        include: {
          permissoes: { include: { rotina: true } },
        },
      });
      if (!perfil) throw new NotFoundException('Perfil não encontrado');
      return perfil;
    });
  }

  create(empresaId: string, input: PerfilCreate, actorId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.perfil.create({
        data: { ...input, empresaId, createdBy: actorId, updatedBy: actorId },
      }),
    );
  }

  async update(
    empresaId: string,
    id: string,
    input: PerfilUpdate,
    actorId: string,
  ) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.perfil.update({
        where: { id },
        data: { ...input, updatedBy: actorId },
      }),
    );
  }

  async remove(empresaId: string, id: string, actorId: string) {
    const perfil = await this.findOne(empresaId, id);
    if (perfil.sistemaBase) {
      throw new NotFoundException(
        'Perfil base do sistema não pode ser excluído',
      );
    }
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.perfil.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: actorId, ativo: false },
      }),
    );
  }

  async updatePermissoes(
    empresaId: string,
    id: string,
    input: PerfilPermissoesUpdate,
    actorId: string,
  ) {
    await this.findOne(empresaId, id);
    return this.prisma.withTenant(empresaId, async (tx) => {
      await Promise.all(
        input.permissoes.map((p) =>
          tx.perfilPermissao.upsert({
            where: {
              perfilId_rotinaId_acao: {
                perfilId: id,
                rotinaId: p.rotinaId,
                acao: p.acao,
              },
            },
            create: {
              perfilId: id,
              rotinaId: p.rotinaId,
              acao: p.acao,
              permitido: p.permitido,
              createdBy: actorId,
              updatedBy: actorId,
            },
            update: { permitido: p.permitido, updatedBy: actorId },
          }),
        ),
      );
      return tx.perfilPermissao.findMany({
        where: { perfilId: id },
        include: { rotina: true },
      });
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  PerfilCreate,
  PerfilPermissoesUpdate,
  PerfilQuery,
  PerfilUpdate,
} from '@plataforma/contracts';

const SORT_FIELDS = new Set(['nome', 'ativo', 'sistemaBase', 'createdAt']);

// Perfil é global (sem empresaId/RLS, ver migration perfil_global) — os
// métodos abaixo não precisam de withTenant/escopo por empresa.
@Injectable()
export class PerfisService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PerfilQuery) {
    const where = {
      deletedAt: null,
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      ...(query.sistemaBase !== undefined ? { sistemaBase: query.sistemaBase } : {}),
      ...(query.search
        ? { nome: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };
    const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'nome';
    const [data, total] = await Promise.all([
      this.prisma.perfil.findMany({
        where,
        ...paginationToSkipTake(query),
        orderBy: { [sortField]: query.sortOrder },
      }),
      this.prisma.perfil.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query);
  }

  async findOne(id: string) {
    const perfil = await this.prisma.perfil.findFirst({
      where: { id, deletedAt: null },
      include: { permissoes: { include: { rotina: true } } },
    });
    if (!perfil) throw new NotFoundException('Perfil não encontrado');
    return perfil;
  }

  async create(input: PerfilCreate, actorId: string) {
    return this.prisma.perfil.create({
      data: { ...input, createdBy: actorId, updatedBy: actorId },
    });
  }

  async update(id: string, input: PerfilUpdate, actorId: string) {
    await this.findOne(id);
    return this.prisma.perfil.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
    });
  }

  async remove(id: string, actorId: string) {
    const perfil = await this.findOne(id);
    if (perfil.sistemaBase) {
      throw new NotFoundException('Perfil base do sistema não pode ser excluído');
    }
    return this.prisma.perfil.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorId, ativo: false },
    });
  }

  async updatePermissoes(id: string, input: PerfilPermissoesUpdate, actorId: string) {
    await this.findOne(id);
    await Promise.all(
      input.permissoes.map((p) =>
        this.prisma.perfilPermissao.upsert({
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
    return this.prisma.perfilPermissao.findMany({
      where: { perfilId: id },
      include: { rotina: true },
    });
  }
}

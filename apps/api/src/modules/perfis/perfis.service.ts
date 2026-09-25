import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
const MODULO_ADMINISTRACAO_ID = 'seed-modulo-administracao';

function formatPerfil<
  T extends {
    rotinaInicial?: { id: string; nome: string; menu?: { rota: string | null } | null } | null;
  },
>(p: T) {
  const { rotinaInicial, ...rest } = p;
  return {
    ...rest,
    rotinaInicialNome: rotinaInicial?.nome ?? null,
    rotinaInicialRota: rotinaInicial?.menu?.rota ?? null,
  };
}

// Perfil é global (sem empresaId/RLS, ver migration perfil_global) — os
// métodos abaixo não precisam de withTenant/escopo por empresa.
@Injectable()
export class PerfisService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `atorEhAdminPlataforma = false` esconde o(s) perfil(is) com
   * `administraPlataforma` da listagem — não porque a leitura seja perigosa
   * (atribuí-lo é que é barrado, em `UsuariosService.garantirPodeAtribuirPerfil`),
   * mas para que ele nem apareça como opção no select de vínculo de quem não
   * pode concedê-lo.
   */
  async findAll(query: PerfilQuery, atorEhAdminPlataforma: boolean) {
    const where = {
      deletedAt: null,
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      ...(query.sistemaBase !== undefined
        ? { sistemaBase: query.sistemaBase }
        : {}),
      ...(atorEhAdminPlataforma ? {} : { administraPlataforma: false }),
      ...(query.search
        ? { nome: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };
    const sortField =
      query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'nome';
    const [data, total] = await Promise.all([
      this.prisma.perfil.findMany({
        where,
        ...paginationToSkipTake(query),
        orderBy: { [sortField]: query.sortOrder },
        include: {
          rotinaInicial: {
            include: { menu: true },
          },
        },
      }),
      this.prisma.perfil.count({ where }),
    ]);
    return buildPaginatedResult(data.map(formatPerfil), total, query);
  }

  async findOne(id: string) {
    const perfil = await this.prisma.perfil.findFirst({
      where: { id, deletedAt: null },
      include: {
        permissoes: { include: { rotina: true } },
        rotinaInicial: { include: { menu: true } },
      },
    });
    if (!perfil) throw new NotFoundException('Perfil não encontrado');
    return formatPerfil(perfil);
  }

  async create(input: PerfilCreate, actorId: string) {
    const perfil = await this.prisma.perfil.create({
      data: { ...input, createdBy: actorId, updatedBy: actorId },
      include: {
        rotinaInicial: { include: { menu: true } },
      },
    });
    return formatPerfil(perfil);
  }

  async update(id: string, input: PerfilUpdate, actorId: string) {
    await this.findOne(id);
    const perfil = await this.prisma.perfil.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
      include: {
        rotinaInicial: { include: { menu: true } },
      },
    });
    return formatPerfil(perfil);
  }

  async remove(id: string, actorId: string) {
    const perfil = await this.findOne(id);
    if (perfil.sistemaBase) {
      throw new NotFoundException(
        'Perfil base do sistema não pode ser excluído',
      );
    }
    return this.prisma.perfil.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorId, ativo: false },
    });
  }

  async updatePermissoes(
    id: string,
    input: PerfilPermissoesUpdate,
    actorId: string,
  ) {
    const perfil = await this.findOne(id);
    const rotinasLiberadas = input.permissoes
      .filter((p) => p.permitido)
      .map((p) => p.rotinaId);

    if (!perfil.sistemaBase && rotinasLiberadas.length > 0) {
      const rotinaAdministrativa = await this.prisma.rotina.findFirst({
        where: {
          id: { in: rotinasLiberadas },
          menu: { moduloId: MODULO_ADMINISTRACAO_ID },
        },
        select: { nome: true },
      });
      if (rotinaAdministrativa) {
        throw new ForbiddenException(
          `A rotina '${rotinaAdministrativa.nome}' é exclusiva de Administradores`,
        );
      }
    }

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

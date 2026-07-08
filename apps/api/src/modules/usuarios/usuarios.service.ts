import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  PaginationQuery,
  UsuarioCreate,
  UsuarioUpdate,
} from '@plataforma/contracts';

const SALT_ROUNDS = 12;

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(empresaId: string, query: PaginationQuery) {
    const where = {
      deletedAt: null,
      usuarioEmpresas: { some: { empresaId, ativo: true } },
      ...(query.search
        ? {
            OR: [
              { nome: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.usuario.findMany({
        where,
        ...paginationToSkipTake(query),
        orderBy: { [query.sortBy ?? 'nome']: query.sortOrder },
        select: {
          id: true,
          nome: true,
          email: true,
          ativo: true,
          ultimoLogin: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
          updatedBy: true,
        },
      }),
      this.prisma.usuario.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query);
  }

  async findOne(id: string) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id, deletedAt: null },
      include: {
        usuarioEmpresas: {
          where: { ativo: true },
          include: { empresa: true, perfil: true },
        },
      },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado');
    const { senhaHash: _senhaHash, ...safe } = usuario;
    return safe;
  }

  async create(input: UsuarioCreate, empresaId: string, actorId: string) {
    const existente = await this.prisma.usuario.findUnique({
      where: { email: input.email },
    });
    if (existente) throw new ConflictException('E-mail já cadastrado');

    const senhaHash = await bcrypt.hash(input.senha, SALT_ROUNDS);

    return this.prisma.usuario.create({
      data: {
        nome: input.nome,
        email: input.email,
        ativo: input.ativo,
        senhaHash,
        createdBy: actorId,
        updatedBy: actorId,
        usuarioEmpresas: {
          create: {
            empresaId,
            perfilId: input.perfilId,
            createdBy: actorId,
            updatedBy: actorId,
          },
        },
      },
      select: {
        id: true,
        nome: true,
        email: true,
        ativo: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async update(id: string, input: UsuarioUpdate, actorId: string) {
    await this.findOne(id);
    return this.prisma.usuario.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
      select: {
        id: true,
        nome: true,
        email: true,
        ativo: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string, actorId: string) {
    await this.findOne(id);
    await this.prisma.usuario.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorId, ativo: false },
    });
    return { success: true };
  }

  async vincularEmpresa(
    usuarioId: string,
    empresaId: string,
    perfilId: string,
    actorId: string,
  ) {
    return this.prisma.usuarioEmpresa.upsert({
      where: { usuarioId_empresaId: { usuarioId, empresaId } },
      create: {
        usuarioId,
        empresaId,
        perfilId,
        createdBy: actorId,
        updatedBy: actorId,
      },
      update: { perfilId, ativo: true, updatedBy: actorId },
    });
  }

  async desvincularEmpresa(usuarioId: string, empresaId: string, actorId: string) {
    await this.prisma.usuarioEmpresa.update({
      where: { usuarioId_empresaId: { usuarioId, empresaId } },
      data: { ativo: false, updatedBy: actorId },
    });
    return { success: true };
  }
}

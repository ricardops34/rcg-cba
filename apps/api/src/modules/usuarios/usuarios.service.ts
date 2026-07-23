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
  UsuarioCreate,
  UsuarioEmpresaCreate,
  UsuarioQuery,
  UsuarioUpdate,
} from '@plataforma/contracts';

const SALT_ROUNDS = 12;
const SORT_FIELDS = new Set(['nome', 'email', 'ativo', 'ultimoLogin', 'createdAt']);

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * "usuario_empresas" e "perfis" têm RLS: o filtro por relação
   * (`usuarioEmpresas: { some: { empresaId } }`) e o include de `perfil` só
   * enxergam linhas dentro do contexto de tenant — por isso roda tudo dentro
   * de `withTenant`, mesmo `usuario` em si não tendo RLS.
   */
  async findAll(empresaId: string, query: UsuarioQuery) {
    const where = {
      deletedAt: null,
      usuarioEmpresas: {
        some: {
          empresaId,
          ativo: true,
          ...(query.perfilId ? { perfilId: query.perfilId } : {}),
        },
      },
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      ...(query.search
        ? {
            OR: [
              { nome: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'nome';

    const [rows, total] = await this.prisma.withTenant(empresaId, (tx) =>
      Promise.all([
        tx.usuario.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
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
            usuarioEmpresas: {
              where: { empresaId, ativo: true },
              select: {
                id: true,
                perfil: { select: { id: true, nome: true } },
                superiorId: true,
                codigoErp: true,
                nomeReduzido: true,
                telefone: true,
                celular: true,
                dataNascimento: true,
              },
              take: 1,
            },
          },
        }),
        tx.usuario.count({ where }),
      ]),
    );

    const data = rows.map(({ usuarioEmpresas, ...usuario }) => {
      const vinculo = usuarioEmpresas[0];
      return {
        ...usuario,
        // Id do vínculo (usuarioEmpresa) nesta empresa — é o que superiorId
        // de OUTRO vínculo referencia (hierarquia é por vínculo, não por
        // usuário, já que um usuário pode ter perfis diferentes por empresa).
        vinculoId: vinculo?.id ?? null,
        perfil: vinculo?.perfil ?? null,
        superiorId: vinculo?.superiorId ?? null,
        codigoErp: vinculo?.codigoErp ?? null,
        nomeReduzido: vinculo?.nomeReduzido ?? null,
        telefone: vinculo?.telefone ?? null,
        celular: vinculo?.celular ?? null,
        dataNascimento: vinculo?.dataNascimento ?? null,
      };
    });

    return buildPaginatedResult(data, total, query);
  }

  /**
   * "perfis" tem RLS habilitada e o usuário pode ter vínculo com várias
   * empresas ao mesmo tempo — então cada perfil só pode ser buscado no
   * contexto de tenant da própria empresa do vínculo (mesmo padrão de
   * AuthService.me). Buscar "perfil" direto no include, sem withTenant,
   * quebra: RLS filtra e o Prisma lança erro porque a relação é obrigatória.
   */
  async findOne(id: string) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id, deletedAt: null },
      include: {
        usuarioEmpresas: {
          where: { ativo: true },
          include: { empresa: true },
        },
      },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado');

    const perfis = await Promise.all(
      usuario.usuarioEmpresas.map((v) =>
        this.prisma.withTenant(v.empresaId, (tx) =>
          tx.perfil.findUniqueOrThrow({ where: { id: v.perfilId } }),
        ),
      ),
    );

    const { senhaHash: _senhaHash, ...safe } = usuario;
    return {
      ...safe,
      usuarioEmpresas: usuario.usuarioEmpresas.map((v, i) => ({ ...v, perfil: perfis[i] })),
    };
  }

  /**
   * Cria o usuário e já vincula com a empresa ativa, com o perfil (RBAC)
   * informado. "usuario_empresas" tem RLS: precisa setar o tenant na mesma
   * transação, antes do create, pra passar no WITH CHECK do insert.
   */
  async create(input: UsuarioCreate, empresaId: string, actorId: string) {
    const existente = await this.prisma.usuario.findUnique({
      where: { email: input.email },
    });
    if (existente) throw new ConflictException('E-mail já cadastrado');

    const senhaHash = await bcrypt.hash(input.senha, SALT_ROUNDS);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresaId}, true)`;
      return tx.usuario.create({
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

  /**
   * Cria (ou edita, mesma rota) o vínculo do usuário com uma empresa —
   * perfil RBAC + hierarquia/dados de vendedor completos.
   */
  async vincularEmpresa(
    usuarioId: string,
    empresaId: string,
    input: UsuarioEmpresaCreate,
    actorId: string,
  ) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.usuarioEmpresa.upsert({
        where: { usuarioId_empresaId: { usuarioId, empresaId } },
        create: {
          usuarioId,
          empresaId,
          perfilId: input.perfilId,
          superiorId: input.superiorId,
          codigoErp: input.codigoErp,
          nomeReduzido: input.nomeReduzido,
          telefone: input.telefone || null,
          celular: input.celular || null,
          dataNascimento: input.dataNascimento,
          createdBy: actorId,
          updatedBy: actorId,
        },
        update: {
          perfilId: input.perfilId,
          superiorId: input.superiorId,
          codigoErp: input.codigoErp,
          nomeReduzido: input.nomeReduzido,
          telefone: input.telefone || null,
          celular: input.celular || null,
          dataNascimento: input.dataNascimento,
          ativo: true,
          updatedBy: actorId,
        },
      }),
    );
  }

  async desvincularEmpresa(usuarioId: string, empresaId: string, actorId: string) {
    await this.prisma.usuarioEmpresa.update({
      where: { usuarioId_empresaId: { usuarioId, empresaId } },
      data: { ativo: false, updatedBy: actorId },
    });
    return { success: true };
  }
}

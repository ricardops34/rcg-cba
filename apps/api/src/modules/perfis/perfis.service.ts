import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { grupoDaEmpresa } from '../../common/perfil/perfil-do-grupo';
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

function nomeRepetido(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Perfil tem dono (migration 20260930200000_perfil_por_grupo):
 *
 * - **da plataforma** (`grupoEconomicoId` nulo): os de sistema e os modelos.
 *   Todo grupo enxerga e atribui; só o administrador da plataforma altera,
 *   porque a alteração vale para todos os clientes.
 * - **do grupo econômico**: o administrador de uma empresa do grupo cria,
 *   edita e exclui; só as empresas do grupo enxergam.
 *
 * O "grupo do ator" é o da empresa ativa da sessão. `perfis` não tem RLS
 * (é lida no login, antes de haver empresa ativa): este corte é o que segura.
 */
@Injectable()
export class PerfisService {
  constructor(private readonly prisma: PrismaService) {}

  private grupoDoAtor(user: AuthenticatedUser) {
    return grupoDaEmpresa(this.prisma, user.empresaAtivaId);
  }

  /**
   * Os da plataforma e os do grupo da empresa ativa. Para quem não administra a
   * plataforma, um perfil da plataforma some quando o grupo tem um com o mesmo
   * nome — o do grupo é a versão dele
   * (a migration deu a cada grupo uma cópia dos que ele usava), e dois
   * "Vendedor" no select só confundiriam.
   *
   * Quem não é administrador da plataforma também não vê o(s) perfil(is) com
   * `administraPlataforma`: não porque a leitura seja perigosa (atribuí-lo é
   * que é barrado, em `UsuariosService.garantirPodeAtribuirPerfil`), mas para
   * que nem apareça como opção no select de vínculo de quem não pode concedê-lo.
   */
  private async visiveis(user: AuthenticatedUser): Promise<Prisma.PerfilWhereInput> {
    const grupo = await this.grupoDoAtor(user);
    // O administrador da plataforma vê todos os da plataforma, mesmo com um de
    // mesmo nome no grupo: são eles que ele administra.
    const doGrupo = grupo && !user.administradorPlataforma
      ? await this.prisma.perfil.findMany({
          where: { grupoEconomicoId: grupo, deletedAt: null },
          select: { nome: true },
        })
      : [];
    return {
      deletedAt: null,
      ...(user.administradorPlataforma ? {} : { administraPlataforma: false }),
      OR: [
        { grupoEconomicoId: null, nome: { notIn: doGrupo.map((p) => p.nome) } },
        ...(grupo ? [{ grupoEconomicoId: grupo }] : []),
      ],
    };
  }

  async findAll(query: PerfilQuery, user: AuthenticatedUser) {
    const where: Prisma.PerfilWhereInput = {
      AND: [
        await this.visiveis(user),
        {
          ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
          ...(query.sistemaBase !== undefined
            ? { sistemaBase: query.sistemaBase }
            : {}),
          ...(query.search
            ? { nome: { contains: query.search, mode: 'insensitive' as const } }
            : {}),
        },
      ],
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

  /** Perfil de outro grupo responde 404, como se não existisse. */
  async findOne(id: string, user: AuthenticatedUser) {
    const grupo = await this.grupoDoAtor(user);
    const perfil = await this.prisma.perfil.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(user.administradorPlataforma
          ? {}
          : {
              OR: [
                { grupoEconomicoId: null },
                ...(grupo ? [{ grupoEconomicoId: grupo }] : []),
              ],
            }),
      },
      include: {
        permissoes: { include: { rotina: true } },
        rotinaInicial: { include: { menu: true } },
      },
    });
    if (!perfil) throw new NotFoundException('Perfil não encontrado');
    return formatPerfil(perfil);
  }

  /** Perfil da plataforma: só o administrador dela. Do grupo: quem é do grupo. */
  private async garantirPodeAlterar(id: string, user: AuthenticatedUser) {
    const perfil = await this.findOne(id, user);
    if (user.administradorPlataforma) return perfil;
    if (perfil.grupoEconomicoId === null) {
      throw new ForbiddenException(
        'Este perfil é da plataforma e vale para todas as empresas. Para personalizar, crie um perfil do grupo.',
      );
    }
    return perfil;
  }

  /**
   * O administrador da plataforma cria perfil da plataforma (modelo para
   * todos); o administrador da empresa cria no grupo da empresa ativa.
   */
  async create(input: PerfilCreate, user: AuthenticatedUser) {
    const grupoEconomicoId = user.administradorPlataforma
      ? null
      : await this.grupoDoAtor(user);
    if (!user.administradorPlataforma && !grupoEconomicoId) {
      throw new ForbiddenException('A empresa ativa não pertence a um grupo econômico');
    }
    try {
      const perfil = await this.prisma.perfil.create({
        data: { ...input, grupoEconomicoId, createdBy: user.id, updatedBy: user.id },
        include: {
          rotinaInicial: { include: { menu: true } },
        },
      });
      return formatPerfil(perfil);
    } catch (err) {
      if (nomeRepetido(err)) throw new ConflictException('Já existe um perfil com este nome');
      throw err;
    }
  }

  async update(id: string, input: PerfilUpdate, user: AuthenticatedUser) {
    await this.garantirPodeAlterar(id, user);
    try {
      const perfil = await this.prisma.perfil.update({
        where: { id },
        data: { ...input, updatedBy: user.id },
        include: {
          rotinaInicial: { include: { menu: true } },
        },
      });
      return formatPerfil(perfil);
    } catch (err) {
      if (nomeRepetido(err)) throw new ConflictException('Já existe um perfil com este nome');
      throw err;
    }
  }

  async remove(id: string, user: AuthenticatedUser) {
    const perfil = await this.garantirPodeAlterar(id, user);
    if (perfil.sistemaBase) {
      throw new NotFoundException(
        'Perfil base do sistema não pode ser excluído',
      );
    }
    return this.prisma.perfil.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
    });
  }

  async updatePermissoes(
    id: string,
    input: PerfilPermissoesUpdate,
    user: AuthenticatedUser,
  ) {
    const perfil = await this.garantirPodeAlterar(id, user);
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
            createdBy: user.id,
            updatedBy: user.id,
          },
          update: { permitido: p.permitido, updatedBy: user.id },
        }),
      ),
    );
    return this.prisma.perfilPermissao.findMany({
      where: { perfilId: id },
      include: { rotina: true },
    });
  }
}

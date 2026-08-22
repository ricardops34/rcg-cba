import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  Comunicado,
  ComunicadoCreate,
  ComunicadoMural,
  ComunicadoQuery,
  ComunicadoUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set([
  'titulo',
  'inicioEm',
  'fimEm',
  'ativo',
  'createdAt',
]);

/** Quantos comunicados o mural da tela inicial mostra. */
const LIMITE_MURAL = 5;

interface LinhaComPerfis {
  id: string;
  empresaId: string;
  titulo: string;
  texto: string;
  inicioEm: Date;
  fimEm: Date | null;
  fixado: boolean;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
  perfis: { perfilId: string }[];
}

/**
 * Comunicados internos — o mural da tela inicial.
 *
 * Não é notificação: não tem destinatário individual, não tem "lido" e não
 * some quando alguém abre. Some quando o prazo acaba ou quem publicou
 * desativa. Por isso mora aqui e não em `notificacoes`.
 */
@Injectable()
export class ComunicadosService {
  constructor(private readonly prisma: PrismaService) {}

  private paraContrato(linha: LinhaComPerfis): Comunicado {
    return {
      id: linha.id,
      empresaId: linha.empresaId,
      titulo: linha.titulo,
      texto: linha.texto,
      inicioEm: linha.inicioEm.toISOString(),
      fimEm: linha.fimEm ? linha.fimEm.toISOString() : null,
      fixado: linha.fixado,
      ativo: linha.ativo,
      perfisIds: linha.perfis.map((p) => p.perfilId),
      createdAt: linha.createdAt.toISOString(),
      updatedAt: linha.updatedAt.toISOString(),
    };
  }

  /**
   * Perfil do usuário na empresa ativa.
   *
   * `AuthenticatedUser` carrega as permissões já resolvidas, mas não o id do
   * perfil — e é o id que o destino do comunicado usa. Devolve null quando
   * não há vínculo ativo: nesse caso só os comunicados "para todos" aparecem.
   */
  private async perfilDoUsuario(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
  ) {
    const vinculo = await tx.usuarioEmpresa.findFirst({
      where: { usuarioId: user.id, empresaId, ativo: true },
      select: { perfilId: true },
    });
    return vinculo?.perfilId ?? null;
  }

  /**
   * O mural da tela inicial: comunicados **vigentes** endereçados a este
   * usuário.
   *
   * A rota não exige `comunicados.visualizar`, de propósito — essa permissão é
   * para *administrar* o cadastro. Um aviso da empresa que só quem administra
   * o mural pudesse ler não avisaria ninguém.
   */
  async mural(
    empresaId: string,
    user: AuthenticatedUser,
  ): Promise<ComunicadoMural[]> {
    const agora = new Date();
    return this.prisma.withTenant(empresaId, async (tx) => {
      const perfilId = await this.perfilDoUsuario(tx, empresaId, user);

      const linhas = await tx.comunicado.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          inicioEm: { lte: agora },
          // Dois OR independentes, por isso dentro de um AND: um objeto só
          // teria a chave `OR` repetida e a segunda apagaria a primeira.
          AND: [
            { OR: [{ fimEm: null }, { fimEm: { gte: agora } }] },
            {
              // Lista de perfis vazia = para todos. O administrador não entra
              // por cima: ele vê o que endereçaram ao perfil dele, senão o
              // mural dele seria o de todo mundo somado.
              OR: [
                { perfis: { none: {} } },
                ...(perfilId ? [{ perfis: { some: { perfilId } } }] : []),
              ],
            },
          ],
        },
        orderBy: [{ fixado: 'desc' }, { inicioEm: 'desc' }],
        take: LIMITE_MURAL,
      });

      return linhas.map((l) => ({
        id: l.id,
        titulo: l.titulo,
        texto: l.texto,
        fixado: l.fixado,
        publicadoEm: l.inicioEm.toISOString(),
      }));
    });
  }

  async findAll(empresaId: string, query: ComunicadoQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  titulo: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  texto: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      };
      const { skip, take } = paginationToSkipTake(query);
      const sortBy =
        query.sortBy && SORT_FIELDS.has(query.sortBy)
          ? query.sortBy
          : 'inicioEm';

      const [total, linhas] = await Promise.all([
        tx.comunicado.count({ where }),
        tx.comunicado.findMany({
          where,
          include: { perfis: { select: { perfilId: true } } },
          orderBy: { [sortBy]: query.sortOrder ?? 'desc' },
          skip,
          take,
        }),
      ]);

      return buildPaginatedResult(
        linhas.map((l) => this.paraContrato(l)),
        total,
        query,
      );
    });
  }

  async findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const linha = await tx.comunicado.findFirst({
        where: { id, empresaId, deletedAt: null },
        include: { perfis: { select: { perfilId: true } } },
      });
      if (!linha) throw new NotFoundException('Comunicado não encontrado');
      return this.paraContrato(linha);
    });
  }

  async create(
    empresaId: string,
    user: AuthenticatedUser,
    dto: ComunicadoCreate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const linha = await tx.comunicado.create({
        data: {
          empresaId,
          titulo: dto.titulo,
          texto: dto.texto,
          inicioEm: dto.inicioEm ?? new Date(),
          fimEm: dto.fimEm ?? null,
          fixado: dto.fixado ?? false,
          ativo: dto.ativo ?? true,
          createdBy: user.id,
          updatedBy: user.id,
          perfis: {
            // `empresaId` também na junção: ela tem policy de RLS própria (ver
            // a migration), e sem o campo a linha nasceria invisível.
            create: (dto.perfisIds ?? []).map((perfilId) => ({
              empresaId,
              perfilId,
            })),
          },
        },
        include: { perfis: { select: { perfilId: true } } },
      });
      return this.paraContrato(linha);
    });
  }

  async update(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    dto: ComunicadoUpdate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existe = await tx.comunicado.findFirst({
        where: { id, empresaId, deletedAt: null },
        select: { id: true },
      });
      if (!existe) throw new NotFoundException('Comunicado não encontrado');

      const linha = await tx.comunicado.update({
        where: { id },
        data: {
          ...(dto.titulo !== undefined ? { titulo: dto.titulo } : {}),
          ...(dto.texto !== undefined ? { texto: dto.texto } : {}),
          ...(dto.inicioEm !== undefined ? { inicioEm: dto.inicioEm } : {}),
          ...(dto.fimEm !== undefined ? { fimEm: dto.fimEm } : {}),
          ...(dto.fixado !== undefined ? { fixado: dto.fixado } : {}),
          ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
          updatedBy: user.id,
          // Trocar o destino substitui a lista inteira: a tela manda "os
          // perfis são estes", e um merge deixaria perfil antigo enxergando o
          // que já não é dele.
          ...(dto.perfisIds !== undefined
            ? {
                perfis: {
                  deleteMany: {},
                  create: dto.perfisIds.map((perfilId) => ({
                    empresaId,
                    perfilId,
                  })),
                },
              }
            : {}),
        },
        include: { perfis: { select: { perfilId: true } } },
      });
      return this.paraContrato(linha);
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existe = await tx.comunicado.findFirst({
        where: { id, empresaId, deletedAt: null },
        select: { id: true },
      });
      if (!existe) throw new NotFoundException('Comunicado não encontrado');
      // Soft delete, como o resto do cadastro. `ativo: false` junto porque o
      // mural filtra por ele — quem apagou não quer que reapareça se alguém
      // restaurar sem pensar.
      await tx.comunicado.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
      return { id };
    });
  }
}

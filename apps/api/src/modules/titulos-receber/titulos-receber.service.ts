import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, type TenantTx } from '../../common/prisma/prisma.service';
import { equipeColaboradorIds } from '../../common/hierarquia/equipe';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  PaginationQuery,
  TituloReceberCreate,
  TituloReceberUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const TITULO_INCLUDE = {
  cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
  colaborador: {
    select: { id: true, nomeReduzido: true, usuario: { select: { nome: true } } },
  },
};

interface TituloListQuery extends PaginationQuery {
  clienteId?: string;
  aberto?: boolean;
  vencido?: boolean;
}

@Injectable()
export class TitulosReceberService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  private async assertColaboradorNaEquipe(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    colaboradorId: string | null | undefined,
  ) {
    if (!colaboradorId) return;
    const equipe = await equipeColaboradorIds(tx, empresaId, user);
    if (equipe && !equipe.includes(colaboradorId)) {
      throw new ForbiddenException('Este vendedor não faz parte da sua equipe');
    }
  }

  findAll(empresaId: string, user: AuthenticatedUser, query: TituloListQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const equipe = await equipeColaboradorIds(tx, empresaId, user);
      const where = {
        empresaId,
        deletedAt: null,
        ...(equipe ? { colaboradorId: { in: equipe } } : {}),
        ...(query.clienteId ? { clienteId: query.clienteId } : {}),
        ...(query.aberto || query.vencido ? { saldo: { gt: 0 } } : {}),
        ...(query.vencido ? { vencimento: { lt: new Date() } } : {}),
        ...(query.search
          ? {
              OR: [
                { numero: { contains: query.search, mode: 'insensitive' as const } },
                { cliente: { razaoSocial: { contains: query.search, mode: 'insensitive' as const } } },
                { cliente: { nomeFantasia: { contains: query.search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.tituloReceber.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { vencimento: 'desc' },
          include: TITULO_INCLUDE,
        }),
        tx.tituloReceber.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  create(empresaId: string, user: AuthenticatedUser, input: TituloReceberCreate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.assertColaboradorNaEquipe(tx, empresaId, user, input.colaboradorId);
      return tx.tituloReceber.create({
        data: {
          ...(this.limpar(input) as object),
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
        } as never,
        include: TITULO_INCLUDE,
      });
    });
  }

  async update(empresaId: string, user: AuthenticatedUser, id: string, input: TituloReceberUpdate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const equipe = await equipeColaboradorIds(tx, empresaId, user);
      const titulo = await tx.tituloReceber.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(equipe ? { colaboradorId: { in: equipe } } : {}),
        },
      });
      if (!titulo) throw new NotFoundException('Título não encontrado');
      if (input.colaboradorId !== undefined) {
        await this.assertColaboradorNaEquipe(tx, empresaId, user, input.colaboradorId);
      }
      return tx.tituloReceber.update({
        where: { id },
        data: { ...(this.limpar(input) as object), updatedBy: user.id } as never,
        include: TITULO_INCLUDE,
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const equipe = await equipeColaboradorIds(tx, empresaId, user);
      const titulo = await tx.tituloReceber.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(equipe ? { colaboradorId: { in: equipe } } : {}),
        },
      });
      if (!titulo) throw new NotFoundException('Título não encontrado');
      return tx.tituloReceber.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }
}

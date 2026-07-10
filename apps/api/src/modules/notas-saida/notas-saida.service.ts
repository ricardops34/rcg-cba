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
  NotaSaidaCreate,
  NotaSaidaUpdate,
  PaginationQuery,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const NOTA_SAIDA_INCLUDE = {
  cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
  colaborador: {
    select: { id: true, nomeReduzido: true, usuario: { select: { nome: true } } },
  },
  itens: { orderBy: { item: 'asc' as const } },
};

interface ItemInput {
  descricao: string;
  quantidade: number;
  vlrUnitario: number;
  vlrDesconto: number;
}

function calcularValores(itens: ItemInput[], vlrDescontoGeral: number) {
  const itensPreparados = itens.map((it, i) => {
    const vlrTotal = it.quantidade * it.vlrUnitario - it.vlrDesconto;
    return { item: i + 1, ...it, vlrTotal };
  });
  const vlrMercadoria = itensPreparados.reduce((s, it) => s + it.quantidade * it.vlrUnitario, 0);
  const vlrItens = itensPreparados.reduce((s, it) => s + it.vlrTotal, 0) - vlrDescontoGeral;
  return { itensPreparados, vlrMercadoria, vlrItens };
}

@Injectable()
export class NotasSaidaService {
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

  findAll(
    empresaId: string,
    user: AuthenticatedUser,
    query: PaginationQuery & { ano?: number; mes?: number; clienteId?: string; comodato?: boolean },
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const equipe = await equipeColaboradorIds(tx, empresaId, user);
      const where = {
        empresaId,
        deletedAt: null,
        ...(equipe ? { colaboradorId: { in: equipe } } : {}),
        ...(query.ano ? { ano: Number(query.ano) } : {}),
        ...(query.mes ? { mes: Number(query.mes) } : {}),
        ...(query.clienteId ? { clienteId: query.clienteId } : {}),
        ...(query.comodato !== undefined ? { comodato: query.comodato } : {}),
        ...(query.search
          ? {
              OR: [
                { numero: { contains: query.search, mode: 'insensitive' as const } },
                { chaveNfe: { contains: query.search, mode: 'insensitive' as const } },
                { cliente: { razaoSocial: { contains: query.search, mode: 'insensitive' as const } } },
                { cliente: { nomeFantasia: { contains: query.search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.notaSaida.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { dtEmissao: 'desc' },
          include: NOTA_SAIDA_INCLUDE,
        }),
        tx.notaSaida.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const equipe = await equipeColaboradorIds(tx, empresaId, user);
      const nota = await tx.notaSaida.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(equipe ? { colaboradorId: { in: equipe } } : {}),
        },
        include: NOTA_SAIDA_INCLUDE,
      });
      if (!nota) throw new NotFoundException('Nota fiscal não encontrada');
      return nota;
    });
  }

  create(empresaId: string, user: AuthenticatedUser, input: NotaSaidaCreate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.assertColaboradorNaEquipe(tx, empresaId, user, input.colaboradorId);

      const { itens, vlrDesconto, dtEmissao, ...resto } = input;
      const { itensPreparados, vlrMercadoria, vlrItens } = calcularValores(itens, vlrDesconto);

      return tx.notaSaida.create({
        data: {
          ...(this.limpar(resto) as object),
          empresaId,
          dtEmissao,
          ano: dtEmissao.getFullYear(),
          mes: dtEmissao.getMonth() + 1,
          vlrDesconto,
          vlrMercadoria,
          vlrItens,
          createdBy: user.id,
          updatedBy: user.id,
          itens: { create: itensPreparados },
        } as never,
        include: NOTA_SAIDA_INCLUDE,
      });
    });
  }

  async update(empresaId: string, user: AuthenticatedUser, id: string, input: NotaSaidaUpdate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const equipe = await equipeColaboradorIds(tx, empresaId, user);
      const nota = await tx.notaSaida.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(equipe ? { colaboradorId: { in: equipe } } : {}),
        },
        include: { itens: true },
      });
      if (!nota) throw new NotFoundException('Nota fiscal não encontrada');
      if (input.colaboradorId !== undefined) {
        await this.assertColaboradorNaEquipe(tx, empresaId, user, input.colaboradorId);
      }

      const { itens, vlrDesconto, dtEmissao, ...resto } = input;
      const itensFinais = itens ?? nota.itens.map((it) => ({
        descricao: it.descricao,
        quantidade: it.quantidade,
        vlrUnitario: it.vlrUnitario,
        vlrDesconto: it.vlrDesconto,
      }));
      const vlrDescontoGeral = vlrDesconto ?? nota.vlrDesconto;
      const { itensPreparados, vlrMercadoria, vlrItens } = calcularValores(itensFinais, vlrDescontoGeral);

      if (itens) {
        await tx.notaSaidaItem.deleteMany({ where: { notaSaidaId: id } });
      }

      return tx.notaSaida.update({
        where: { id },
        data: {
          ...(this.limpar(resto) as object),
          ...(dtEmissao
            ? { dtEmissao, ano: dtEmissao.getFullYear(), mes: dtEmissao.getMonth() + 1 }
            : {}),
          vlrDesconto: vlrDescontoGeral,
          vlrMercadoria,
          vlrItens,
          updatedBy: user.id,
          ...(itens ? { itens: { create: itensPreparados } } : {}),
        } as never,
        include: NOTA_SAIDA_INCLUDE,
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const equipe = await equipeColaboradorIds(tx, empresaId, user);
      const nota = await tx.notaSaida.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(equipe ? { colaboradorId: { in: equipe } } : {}),
        },
      });
      if (!nota) throw new NotFoundException('Nota fiscal não encontrada');
      return tx.notaSaida.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }
}

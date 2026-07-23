import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { equipeColaboradorIds } from '../../common/hierarquia/equipe';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  ClienteCreate,
  ClienteUpdate,
  PaginationQuery,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    // Campos string vazios do formulário viram null no banco.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  findAll(empresaId: string, user: AuthenticatedUser, query: PaginationQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const equipe = await equipeColaboradorIds(tx, empresaId, user);
      const where = {
        empresaId,
        deletedAt: null,
        // Regra de visão: vendedor vê a própria carteira; supervisor/gerente
        // veem a de toda a equipe abaixo; admin vê tudo (equipe = null).
        ...(equipe ? { colaboradorId: { in: equipe } } : {}),
        ...(query.search
          ? {
              OR: [
                { razaoSocial: { contains: query.search, mode: 'insensitive' as const } },
                { nomeFantasia: { contains: query.search, mode: 'insensitive' as const } },
                { cnpjCpf: { contains: query.search, mode: 'insensitive' as const } },
                { codigoErp: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.cliente.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { razaoSocial: 'asc' },
          include: {
            colaborador: {
              select: { id: true, nomeReduzido: true, usuario: { select: { nome: true } } },
            },
          },
        }),
        tx.cliente.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  create(empresaId: string, user: AuthenticatedUser, input: ClienteCreate) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.cliente.create({
        data: {
          ...(this.limpar(input) as object),
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
        } as never,
      }),
    );
  }

  async update(empresaId: string, user: AuthenticatedUser, id: string, input: ClienteUpdate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const cliente = await tx.cliente.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');
      return tx.cliente.update({
        where: { id },
        data: { ...(this.limpar(input) as object), updatedBy: user.id } as never,
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const cliente = await tx.cliente.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');
      return tx.cliente.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }

  /**
   * Posição consolidada do cliente: indicadores de compra (notas de saída),
   * financeiro (títulos a receber) e comodato — equivalente às views
   * cliente_indicadores / view_cliente_saldo_titulo do sistema legado.
   */
  async posicao(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const equipe = await equipeColaboradorIds(tx, empresaId, user);
      const cliente = await tx.cliente.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(equipe ? { colaboradorId: { in: equipe } } : {}),
        },
        include: {
          colaborador: {
            select: { nomeReduzido: true, usuario: { select: { nome: true } } },
          },
        },
      });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');

      const hoje = new Date();
      const inicio12m = new Date(hoje);
      inicio12m.setMonth(inicio12m.getMonth() - 12);

      const notasWhere = { empresaId, clienteId: id, deletedAt: null, ativo: true };
      const titulosWhere = { empresaId, clienteId: id, deletedAt: null, ativo: true };

      const [vendas, faturamento12m, comodatos, titulosAbertos, tituloMaisAtrasado] =
        await Promise.all([
          tx.notaSaida.aggregate({
            where: { ...notasWhere, comodato: false },
            _count: true,
            _sum: { vlrItens: true },
            _min: { dtEmissao: true },
            _max: { dtEmissao: true },
          }),
          tx.notaSaida.aggregate({
            where: { ...notasWhere, comodato: false, dtEmissao: { gte: inicio12m } },
            _sum: { vlrItens: true },
          }),
          tx.notaSaida.aggregate({
            where: { ...notasWhere, comodato: true },
            _count: true,
            _sum: { vlrItens: true },
          }),
          tx.tituloReceber.aggregate({
            where: { ...titulosWhere, saldo: { gt: 0 } },
            _count: true,
            _sum: { saldo: true },
          }),
          tx.tituloReceber.findFirst({
            where: { ...titulosWhere, saldo: { gt: 0 }, vencimento: { lt: hoje } },
            orderBy: { vencimento: 'asc' },
            select: { vencimento: true },
          }),
        ]);

      const vencidos = await tx.tituloReceber.aggregate({
        where: { ...titulosWhere, saldo: { gt: 0 }, vencimento: { lt: hoje } },
        _sum: { saldo: true },
      });

      const ultimaCompra = vendas._max.dtEmissao;
      const qtdNotas = vendas._count;
      const faturamentoTotal = vendas._sum.vlrItens ?? 0;
      const DIA_MS = 24 * 60 * 60 * 1000;

      return {
        cliente: {
          id: cliente.id,
          codigoErp: cliente.codigoErp,
          razaoSocial: cliente.razaoSocial,
          nomeFantasia: cliente.nomeFantasia,
          cnpjCpf: cliente.cnpjCpf,
          municipio: cliente.municipio,
          uf: cliente.uf,
          telefone: cliente.telefone,
          email: cliente.email,
          ativo: cliente.ativo,
          vendedorNome:
            cliente.colaborador?.nomeReduzido ?? cliente.colaborador?.usuario?.nome ?? null,
        },
        indicadores: {
          primeiraCompra: vendas._min.dtEmissao?.toISOString() ?? null,
          ultimaCompra: ultimaCompra?.toISOString() ?? null,
          diasSemCompra: ultimaCompra
            ? Math.floor((hoje.getTime() - ultimaCompra.getTime()) / DIA_MS)
            : null,
          qtdNotas,
          faturamento12m: faturamento12m._sum.vlrItens ?? 0,
          ticketMedio: qtdNotas > 0 ? faturamentoTotal / qtdNotas : 0,
          saldoAberto: titulosAbertos._sum.saldo ?? 0,
          valorVencido: vencidos._sum.saldo ?? 0,
          titulosAbertos: titulosAbertos._count,
          maiorAtraso: tituloMaisAtrasado
            ? Math.floor((hoje.getTime() - tituloMaisAtrasado.vencimento.getTime()) / DIA_MS)
            : 0,
          comodatoAtivo: comodatos._sum.vlrItens ?? 0,
          qtdComodatos: comodatos._count,
        },
      };
    });
  }
}

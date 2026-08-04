import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, type TenantTx } from '../../common/prisma/prisma.service';
import {
  combinarFiltroVendedor,
  resolverEscopoVendedores,
  type EscopoVendedores,
} from '../../common/escopo/escopo-vendedores';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  OrcamentoCreate,
  OrcamentoItemLinha,
  OrcamentoQuery,
  OrcamentoUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set(['titulo', 'status', 'vlrTotal', 'dataValidade', 'ativo', 'createdAt']);

const CLIENTE_SELECT = { select: { id: true, razaoSocial: true, nomeFantasia: true } };
const VENDEDOR_SELECT = { select: { id: true, nome: true, nomeReduzido: true } };
const OPORTUNIDADE_SELECT = { select: { id: true, titulo: true } };
const CONDICAO_PAGAMENTO_SELECT = { select: { id: true, descricao: true } };
const PRODUTO_SELECT = { select: { id: true, codigoErp: true, descricao: true, unidade: true } };
const INCLUDE = {
  cliente: CLIENTE_SELECT,
  vendedor: VENDEDOR_SELECT,
  oportunidade: OPORTUNIDADE_SELECT,
  condicaoPagamento: CONDICAO_PAGAMENTO_SELECT,
  itens: { include: { produto: PRODUTO_SELECT } },
};

@Injectable()
export class OrcamentosService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  private garantirVendedorNoEscopo(escopo: EscopoVendedores, vendedorId: string) {
    if (escopo !== null && !escopo.includes(vendedorId)) {
      throw new NotFoundException('Vendedor fora do seu escopo');
    }
  }

  private async garantirClienteNoEscopo(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
    clienteId: string,
  ) {
    const cliente = await tx.cliente.findFirst({
      where: { id: clienteId, empresaId, deletedAt: null },
      select: { vendedorId: true },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    if (escopo !== null && (!cliente.vendedorId || !escopo.includes(cliente.vendedorId))) {
      throw new NotFoundException('Cliente fora do seu escopo');
    }
  }

  private async garantirOportunidadeNoEscopo(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
    oportunidadeId: string,
  ) {
    const oportunidade = await tx.oportunidade.findFirst({
      where: { id: oportunidadeId, empresaId, deletedAt: null },
      select: { vendedorId: true },
    });
    if (!oportunidade) throw new NotFoundException('Oportunidade não encontrada');
    if (escopo !== null && !escopo.includes(oportunidade.vendedorId)) {
      throw new NotFoundException('Oportunidade fora do seu escopo');
    }
  }

  /**
   * Resolve vlrTabela de cada item na Tabela de Preço vinculada ao cliente
   * (batch, mesmo padrão de ClientesService.posicao) e calcula desconto/total
   * a partir do vlrUnitario informado (editável por linha). Sem tabela
   * vinculada ao cliente, ou sem preço cadastrado pro produto, vlrTabela fica
   * null — o vlrUnitario informado é usado do mesmo jeito, sem desconto
   * calculado.
   */
  private async calcularItens(
    tx: TenantTx,
    empresaId: string,
    clienteId: string,
    itens: OrcamentoItemLinha[],
  ) {
    if (itens.length === 0) return { data: [] as Record<string, unknown>[], vlrTotal: 0 };

    const cliente = await tx.cliente.findFirst({
      where: { id: clienteId, empresaId },
      select: { tabelaPrecoId: true },
    });

    const produtoIds = itens.map((i) => i.produtoId);
    const precos = cliente?.tabelaPrecoId
      ? await tx.tabelaPrecoItem.findMany({
          where: {
            tabelaPrecoId: cliente.tabelaPrecoId,
            produtoId: { in: produtoIds },
            deletedAt: null,
          },
          select: { produtoId: true, preco: true },
        })
      : [];
    const precoPorProduto = new Map(precos.map((p) => [p.produtoId, p.preco]));

    let vlrTotalOrcamento = 0;
    const data = itens.map((item) => {
      const vlrTabela = precoPorProduto.get(item.produtoId) ?? null;
      const vlrDesconto =
        vlrTabela != null && vlrTabela > item.vlrUnitario
          ? Math.round((vlrTabela - item.vlrUnitario) * item.quantidade * 100) / 100
          : 0;
      const percDesconto =
        vlrTabela ? Math.round(((vlrTabela - item.vlrUnitario) / vlrTabela) * 10000) / 100 : null;
      const vlrTotalItem = Math.round(item.vlrUnitario * item.quantidade * 100) / 100;
      vlrTotalOrcamento += vlrTotalItem;
      return {
        empresaId,
        produtoId: item.produtoId,
        quantidade: item.quantidade,
        vlrTabela,
        vlrUnitario: item.vlrUnitario,
        percDesconto,
        vlrDesconto,
        vlrTotal: vlrTotalItem,
      };
    });
    return { data, vlrTotal: Math.round(vlrTotalOrcamento * 100) / 100 };
  }

  /**
   * dataRetorno definida (na criação, ou numa edição que muda o valor) gera
   * uma Atividade de acompanhamento (tipo ligação) vinculada ao orçamento —
   * vira lembrete na Agenda/Atividades pro vendedor retomar contato com o
   * cliente, que pode resultar num novo orçamento.
   */
  private async criarAtividadeRetorno(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    params: {
      orcamentoId: string;
      titulo: string;
      clienteId: string;
      vendedorId: string;
      oportunidadeId: string | null;
      dataRetorno: Date;
    },
  ) {
    await tx.atividade.create({
      data: {
        empresaId,
        clienteId: params.clienteId,
        oportunidadeId: params.oportunidadeId,
        orcamentoId: params.orcamentoId,
        vendedorId: params.vendedorId,
        tipo: 'ligacao',
        titulo: `Retorno: ${params.titulo}`,
        dataVencimento: params.dataRetorno,
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
  }

  /**
   * Preço de um produto pra um cliente específico — alimenta o pré-preenchimento
   * de vlrUnitario ao adicionar um item no form de orçamento (vlrTabela da
   * Tabela de Preço vinculada ao cliente, com ultimoPreco do produto como
   * fallback informativo quando não há tabela/preço cadastrado).
   */
  async precoProduto(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
    produtoId: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      await this.garantirClienteNoEscopo(tx, empresaId, escopo, clienteId);

      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId, empresaId },
        select: { tabelaPrecoId: true },
      });
      const [tabelaItem, produto] = await Promise.all([
        cliente?.tabelaPrecoId
          ? tx.tabelaPrecoItem.findFirst({
              where: { tabelaPrecoId: cliente.tabelaPrecoId, produtoId, deletedAt: null },
              select: { preco: true },
            })
          : Promise.resolve(null),
        tx.produto.findFirst({ where: { id: produtoId, empresaId }, select: { ultimoPreco: true } }),
      ]);
      return { vlrTabela: tabelaItem?.preco ?? null, ultimoPreco: produto?.ultimoPreco ?? null };
    });
  }

  findAll(empresaId: string, user: AuthenticatedUser, query: OrcamentoQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const where = {
        empresaId,
        deletedAt: null,
        ...combinarFiltroVendedor(escopo, query.vendedorId),
        ...(query.clienteId ? { clienteId: query.clienteId } : {}),
        ...(query.oportunidadeId ? { oportunidadeId: query.oportunidadeId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.search
          ? { titulo: { contains: query.search, mode: 'insensitive' as const } }
          : {}),
        ...(query.dataInicio || query.dataFim
          ? {
              createdAt: {
                ...(query.dataInicio ? { gte: query.dataInicio } : {}),
                ...(query.dataFim ? { lte: query.dataFim } : {}),
              },
            }
          : {}),
      };
      const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'createdAt';
      const [data, total] = await Promise.all([
        tx.orcamento.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.orcamento.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const orcamento = await tx.orcamento.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        include: INCLUDE,
      });
      if (!orcamento) throw new NotFoundException('Orçamento não encontrado');
      return orcamento;
    });
  }

  create(empresaId: string, user: AuthenticatedUser, input: OrcamentoCreate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      this.garantirVendedorNoEscopo(escopo, input.vendedorId);
      await this.garantirClienteNoEscopo(tx, empresaId, escopo, input.clienteId);
      if (input.oportunidadeId) {
        await this.garantirOportunidadeNoEscopo(tx, empresaId, escopo, input.oportunidadeId);
      }

      const { itens, ...header } = input;
      const { data: itensData, vlrTotal } = await this.calcularItens(
        tx,
        empresaId,
        input.clienteId,
        itens,
      );

      const orcamento = await tx.orcamento.create({
        data: {
          ...(this.limpar(header) as object),
          empresaId,
          vlrTotal,
          createdBy: user.id,
          updatedBy: user.id,
          itens: { create: itensData },
        } as never,
        include: INCLUDE,
      });

      if (header.dataRetorno) {
        await this.criarAtividadeRetorno(tx, empresaId, user, {
          orcamentoId: orcamento.id,
          titulo: orcamento.titulo,
          clienteId: orcamento.clienteId,
          vendedorId: orcamento.vendedorId,
          oportunidadeId: orcamento.oportunidadeId,
          dataRetorno: header.dataRetorno,
        });
      }

      return orcamento;
    });
  }

  async update(empresaId: string, user: AuthenticatedUser, id: string, input: OrcamentoUpdate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const orcamento = await tx.orcamento.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!orcamento) throw new NotFoundException('Orçamento não encontrado');

      if (input.vendedorId) this.garantirVendedorNoEscopo(escopo, input.vendedorId);
      if (input.clienteId) await this.garantirClienteNoEscopo(tx, empresaId, escopo, input.clienteId);
      if (input.oportunidadeId) {
        await this.garantirOportunidadeNoEscopo(tx, empresaId, escopo, input.oportunidadeId);
      }

      const { itens, ...header } = input;
      let itensUpdate: Record<string, unknown> = {};
      if (itens) {
        await tx.orcamentoItem.deleteMany({ where: { orcamentoId: id } });
        const clienteId = input.clienteId ?? orcamento.clienteId;
        const { data: itensData, vlrTotal } = await this.calcularItens(
          tx,
          empresaId,
          clienteId,
          itens,
        );
        itensUpdate = { vlrTotal, itens: { create: itensData } };
      }

      const atualizado = await tx.orcamento.update({
        where: { id },
        data: {
          ...(this.limpar(header) as object),
          updatedBy: user.id,
          ...itensUpdate,
        } as never,
        include: INCLUDE,
      });

      const dataRetornoMudou =
        header.dataRetorno != null &&
        (!orcamento.dataRetorno || header.dataRetorno.getTime() !== orcamento.dataRetorno.getTime());
      if (dataRetornoMudou) {
        await this.criarAtividadeRetorno(tx, empresaId, user, {
          orcamentoId: atualizado.id,
          titulo: atualizado.titulo,
          clienteId: atualizado.clienteId,
          vendedorId: atualizado.vendedorId,
          oportunidadeId: atualizado.oportunidadeId,
          dataRetorno: header.dataRetorno as Date,
        });
      }

      return atualizado;
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const orcamento = await tx.orcamento.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!orcamento) throw new NotFoundException('Orçamento não encontrado');
      return tx.orcamento.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }
}

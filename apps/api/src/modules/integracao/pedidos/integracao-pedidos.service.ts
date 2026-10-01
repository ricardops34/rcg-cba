import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../../common/prisma/prisma.service';
import type {
  IntegracaoLoteResultado,
  IntegracaoPedido,
  IntegracaoPedidoCreate,
  IntegracaoPedidoLoteItem,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import { processarLote } from '../common/processar-lote';
import { resolverCliente } from '../common/resolver-cliente';
import { resolverVendedor } from '../common/resolver-vendedor';
import { criarFilhos } from '../common/sincronizar-filhos';
import { pedidoTemQuebra } from './pedido-tem-quebra';

/**
 * Situação do pedido de venda que o ERP gerou a partir de um orçamento
 * (docs/planos/2026-09-28-orcamento-situacao-erp.md).
 *
 * O pedido não vira registro próprio aqui: ele é o acompanhamento do
 * orçamento. A chave do pedido (C5_FILIAL-C5_NUM) é a mesma que o vínculo
 * (PATCH .../orcamentos/pendentes/{id}) gravou no orçamento, e é por ela que
 * o orçamento é encontrado.
 *
 * Pedido digitado direto no ERP não tem orçamento: entra como histórico, um
 * orçamento de origem `erp` que espelha o pedido
 * (docs/planos/2026-09-30-historico-pedidos-erp.md).
 */
@Injectable()
export class IntegracaoPedidosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aplica um lote. `excluido: true` é o pedido excluído no ERP e vira
   * Cancelado; os demais atualizam situação, quebra e notas. Nada é criado,
   * então o relatório só tem `atualizados` e `excluidos`.
   */
  upsertLote(
    empresaId: string,
    apiKeyId: string,
    registros: IntegracaoPedidoLoteItem[],
  ): Promise<IntegracaoLoteResultado> {
    return processarLote(registros, async (item) => {
      if (item.excluido) {
        await this.cancelar(empresaId, apiKeyId, item.chave);
        return 'excluido';
      }
      await this.atualizar(empresaId, apiKeyId, item as IntegracaoPedidoCreate);
      return 'atualizado';
    });
  }

  /** Pedido excluído no ERP: o orçamento fica Cancelado. */
  async cancelar(
    empresaId: string,
    apiKeyId: string,
    chave: string,
  ): Promise<IntegracaoPedido> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const orcamento = await this.orcamentoDoPedido(tx, empresaId, chave);
      const atualizado = await tx.orcamento.update({
        where: { id: orcamento.id },
        data: {
          situacaoErp: 'cancelado',
          situacaoErpEm: new Date(),
          updatedBy: autor,
        },
      });
      return this.paraLeitura(chave, atualizado);
    });
  }

  /**
   * Situação, quebra e notas do pedido gravados no orçamento que o gerou. O
   * pedido sem orçamento (digitado no ERP) cria ou atualiza o histórico.
   */
  async atualizar(
    empresaId: string,
    apiKeyId: string,
    pedido: IntegracaoPedidoCreate,
  ): Promise<IntegracaoPedido> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const orcamento = await tx.orcamento.findFirst({
        where: { empresaId, chave: pedido.chave, deletedAt: null },
        select: { id: true, origem: true },
      });
      if (!orcamento || orcamento.origem === 'erp') {
        return this.gravarHistorico(
          tx,
          empresaId,
          autor,
          pedido,
          orcamento?.id,
        );
      }
      const itensOrcamento = await tx.orcamentoItem.findMany({
        where: { orcamentoId: orcamento.id },
        select: { chave: true, quantidade: true, vlrUnitario: true },
      });

      const atualizado = await tx.orcamento.update({
        where: { id: orcamento.id },
        data: {
          situacaoErp: pedido.situacao,
          situacaoErpEm: new Date(),
          comQuebra: pedidoTemQuebra(itensOrcamento, pedido.itens),
          notasErp: pedido.notas,
          itensErp: pedido.itens,
          updatedBy: autor,
        },
      });
      return this.paraLeitura(pedido.chave, atualizado);
    });
  }

  /**
   * Pedido digitado no ERP, como histórico: orçamento de origem `erp`,
   * aprovado, sem número de proposta, com itens e preços como o ERP mandou —
   * sem recalcular pela Tabela de Preço, sem validade e sem Atividade de
   * retorno. É espelho do pedido: cada mensagem regrava cabeçalho e itens, e
   * não há quebra (falta o lado "aprovado na plataforma" para comparar).
   */
  private async gravarHistorico(
    tx: TenantTx,
    empresaId: string,
    autor: string,
    pedido: IntegracaoPedidoCreate,
    orcamentoId: string | undefined,
  ): Promise<IntegracaoPedido> {
    if (
      !orcamentoId &&
      (!pedido.clienteChave || !pedido.vendedorChave || !pedido.emissao)
    ) {
      throw new NotFoundException(
        `Nenhum orçamento vinculado ao pedido '${pedido.chave}'; para entrar ` +
          'como histórico, o pedido precisa de clienteChave, vendedorChave e emissao',
      );
    }

    const itens: {
      empresaId: string;
      produtoId: string;
      chave: string;
      quantidade: number;
      vlrUnitario: number;
      vlrTotal: number;
    }[] = [];
    for (const item of criarFilhos(pedido.itens)) {
      const produto = await tx.produto.findFirst({
        where: { empresaId, chave: item.produtoChave, deletedAt: null },
        select: { id: true },
      });
      if (!produto) {
        throw new NotFoundException(
          `itens[].produtoChave '${item.produtoChave}' não encontrado`,
        );
      }
      itens.push({
        empresaId,
        produtoId: produto.id,
        chave: item.chave,
        quantidade: item.quantidade,
        vlrUnitario: item.vlrUnitario,
        vlrTotal: Math.round(item.quantidade * item.vlrUnitario * 100) / 100,
      });
    }
    const vlrTotal =
      Math.round(itens.reduce((soma, item) => soma + item.vlrTotal, 0) * 100) /
      100;

    // resolverCliente/resolverVendedor lançam 404 quando não acham.
    const clienteId = pedido.clienteChave
      ? await resolverCliente(tx, empresaId, pedido.clienteChave)
      : null;
    const vendedorId = pedido.vendedorChave
      ? await resolverVendedor(tx, empresaId, pedido.vendedorChave)
      : null;
    const dados = {
      ...(clienteId ? { clienteId } : {}),
      ...(vendedorId ? { vendedorId } : {}),
      ...(pedido.condicaoPagamentoChave !== undefined
        ? {
            condicaoPagamentoId: await this.resolverCondicaoPagamento(
              tx,
              empresaId,
              pedido.condicaoPagamentoChave,
            ),
          }
        : {}),
      // A emissão vira a data do registro: é por ela que a listagem ordena.
      // Meio-dia UTC para o dia não escorregar com o fuso.
      ...(pedido.emissao
        ? { createdAt: new Date(`${pedido.emissao}T12:00:00.000Z`) }
        : {}),
      codigoErp: pedido.codigoErp ?? null,
      titulo: `Pedido ${pedido.codigoErp ?? pedido.chave}`,
      vlrTotal,
      situacaoErp: pedido.situacao,
      situacaoErpEm: new Date(),
      comQuebra: false,
      notasErp: pedido.notas,
      itensErp: pedido.itens,
      updatedBy: autor,
    };

    if (orcamentoId) {
      await tx.orcamentoItem.deleteMany({ where: { orcamentoId } });
      await tx.orcamentoItem.createMany({
        data: itens.map((item) => ({ ...item, orcamentoId })),
      });
    }
    const gravado = orcamentoId
      ? await tx.orcamento.update({
          where: { id: orcamentoId },
          data: dados as never,
        })
      : await tx.orcamento.create({
          data: {
            ...dados,
            empresaId,
            chave: pedido.chave,
            numero: null,
            origem: 'erp',
            status: 'aprovado',
            createdBy: autor,
            itens: { createMany: { data: itens } },
          } as never,
        });
    return this.paraLeitura(pedido.chave, gravado);
  }

  private async resolverCondicaoPagamento(
    tx: TenantTx,
    empresaId: string,
    chave: string | null,
  ) {
    if (!chave) return null;
    const condicao = await tx.condicaoPagamento.findFirst({
      where: { empresaId, chave, deletedAt: null },
      select: { id: true },
    });
    if (!condicao) {
      throw new NotFoundException(
        `condicaoPagamentoChave '${chave}' não encontrado`,
      );
    }
    return condicao.id;
  }

  private paraLeitura(
    chave: string,
    orcamento: {
      id: string;
      situacaoErp: IntegracaoPedido['situacaoErp'];
      comQuebra: boolean;
    },
  ): IntegracaoPedido {
    return {
      id: orcamento.id,
      chave,
      situacaoErp: orcamento.situacaoErp,
      comQuebra: orcamento.comQuebra,
    };
  }

  private async orcamentoDoPedido(
    tx: TenantTx,
    empresaId: string,
    chave: string,
  ) {
    const orcamento = await tx.orcamento.findFirst({
      where: { empresaId, chave, deletedAt: null },
      select: { id: true },
    });
    if (!orcamento) {
      throw new NotFoundException(
        `Nenhum orçamento vinculado ao pedido '${chave}'`,
      );
    }
    return orcamento;
  }
}

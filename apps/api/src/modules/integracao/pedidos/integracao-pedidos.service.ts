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
import { pedidoTemQuebra } from './pedido-tem-quebra';

/**
 * Situação do pedido de venda que o ERP gerou a partir de um orçamento
 * (docs/planos/2026-09-28-orcamento-situacao-erp.md).
 *
 * O pedido não vira registro próprio aqui: ele é o acompanhamento do
 * orçamento. A chave do pedido (C5_FILIAL-C5_NUM) é a mesma que o vínculo
 * (PATCH .../orcamentos/pendentes/{id}) gravou no orçamento, e é por ela que
 * o orçamento é encontrado.
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

  /** Situação, quebra e notas do pedido gravados no orçamento que o gerou. */
  async atualizar(
    empresaId: string,
    apiKeyId: string,
    pedido: IntegracaoPedidoCreate,
  ): Promise<IntegracaoPedido> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const orcamento = await this.orcamentoDoPedido(
        tx,
        empresaId,
        pedido.chave,
      );
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

import type { TenantTx } from '../../common/prisma/prisma.service';
import type { OrcamentoItemLinha } from '@plataforma/contracts';

/**
 * Resolve vlrTabela de cada item na Tabela de Preço vinculada ao cliente
 * (batch, mesmo padrão de ClientesService.posicao) e calcula desconto/total
 * a partir do vlrUnitario informado (editável por linha). Sem tabela
 * vinculada ao cliente, ou sem preço cadastrado pro produto, vlrTabela fica
 * null — o vlrUnitario informado é usado do mesmo jeito, sem desconto
 * calculado. Compartilhado entre OrcamentosService (tela) e
 * IntegracaoOrcamentosService (API externa).
 */
export async function calcularItensOrcamento(
  tx: TenantTx,
  empresaId: string,
  clienteId: string,
  itens: OrcamentoItemLinha[],
) {
  if (itens.length === 0)
    return { data: [] as Record<string, unknown>[], vlrTotal: 0 };

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
        ? Math.round((vlrTabela - item.vlrUnitario) * item.quantidade * 100) /
          100
        : 0;
    const percDesconto = vlrTabela
      ? Math.round(((vlrTabela - item.vlrUnitario) / vlrTabela) * 10000) / 100
      : null;
    const vlrTotalItem =
      Math.round(item.vlrUnitario * item.quantidade * 100) / 100;
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

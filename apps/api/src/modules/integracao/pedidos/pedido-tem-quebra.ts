/** Linha comparável: a chave do SC6 e o que foi vendido nela. */
export interface LinhaComparavel {
  chave: string | null;
  quantidade: number;
  vlrUnitario: number;
}

// Preço chega do ERP com as casas do C6_PRCVEN; meio centavo absorve o
// arredondamento sem esconder desconto de verdade.
const TOLERANCIA_PRECO = 0.005;
const TOLERANCIA_QUANTIDADE = 0.000001;

/**
 * O pedido no ERP difere do orçamento aprovado? Qualquer diferença conta
 * (decisão do usuário, 28/09/2026): item incluído ou retirado, quantidade ou
 * preço diferente.
 *
 * O casamento é pela chave do SC6 — a que o vínculo gravou em cada item do
 * orçamento. Item do orçamento sem chave é o que o ERP não aceitou no pedido
 * (produto inexistente, sem quantidade): conta como retirado.
 */
export function pedidoTemQuebra(
  orcamento: LinhaComparavel[],
  pedido: LinhaComparavel[],
): boolean {
  const doPedido = new Map(
    pedido.map((linha) => [linha.chave ?? '', linha] as const),
  );

  for (const linha of orcamento) {
    const noPedido = linha.chave ? doPedido.get(linha.chave) : undefined;
    if (!noPedido) return true;
    if (
      Math.abs(noPedido.quantidade - linha.quantidade) > TOLERANCIA_QUANTIDADE
    )
      return true;
    if (Math.abs(noPedido.vlrUnitario - linha.vlrUnitario) > TOLERANCIA_PRECO)
      return true;
    doPedido.delete(linha.chave!);
  }

  // Sobrou linha do pedido que não veio do orçamento: item incluído no ERP.
  return doPedido.size > 0;
}

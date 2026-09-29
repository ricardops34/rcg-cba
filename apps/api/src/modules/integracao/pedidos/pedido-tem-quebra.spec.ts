import { pedidoTemQuebra, type LinhaComparavel } from './pedido-tem-quebra';

const linha = (
  chave: string | null,
  quantidade = 5,
  vlrUnitario = 10,
): LinhaComparavel => ({ chave, quantidade, vlrUnitario });

describe('pedidoTemQuebra', () => {
  it('pedido igual ao orcamento nao tem quebra', () => {
    expect(
      pedidoTemQuebra([linha('A'), linha('B')], [linha('B'), linha('A')]),
    ).toBe(false);
  });

  it('quantidade diferente e quebra', () => {
    expect(pedidoTemQuebra([linha('A', 5)], [linha('A', 4)])).toBe(true);
  });

  it('preco diferente e quebra; arredondamento de meio centavo nao', () => {
    expect(pedidoTemQuebra([linha('A', 5, 10)], [linha('A', 5, 9.9)])).toBe(
      true,
    );
    expect(pedidoTemQuebra([linha('A', 5, 10)], [linha('A', 5, 10.004)])).toBe(
      false,
    );
  });

  it('item retirado no ERP e quebra', () => {
    expect(pedidoTemQuebra([linha('A'), linha('B')], [linha('A')])).toBe(true);
  });

  it('item incluido no ERP e quebra', () => {
    expect(pedidoTemQuebra([linha('A')], [linha('A'), linha('C')])).toBe(true);
  });

  it('item do orcamento que nao entrou no pedido (sem chave) e quebra', () => {
    expect(pedidoTemQuebra([linha('A'), linha(null)], [linha('A')])).toBe(true);
  });
});

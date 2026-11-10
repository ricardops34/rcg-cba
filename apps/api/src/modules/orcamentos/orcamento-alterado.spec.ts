import { cabecalhoMudou, itensMudaram } from './orcamento-alterado';

describe('orcamento-alterado', () => {
  const item = (produtoId: string, quantidade = 1, vlrUnitario = 10) => ({
    produtoId,
    quantidade,
    vlrUnitario,
  });

  describe('itensMudaram', () => {
    it('os mesmos itens, em outra ordem, não são alteração', () => {
      expect(
        itensMudaram([item('a'), item('b', 2)], [item('b', 2), item('a')]),
      ).toBe(false);
    });

    it('diferença abaixo de um centavo não conta', () => {
      expect(itensMudaram([item('a', 1, 10)], [item('a', 1, 10.001)])).toBe(
        false,
      );
    });

    it('preço, quantidade, produto ou linha a mais são alteração', () => {
      expect(itensMudaram([item('a')], [item('a', 1, 9)])).toBe(true);
      expect(itensMudaram([item('a')], [item('a', 2)])).toBe(true);
      expect(itensMudaram([item('a')], [item('b')])).toBe(true);
      expect(itensMudaram([item('a')], [item('a'), item('b')])).toBe(true);
    });
  });

  describe('cabecalhoMudou', () => {
    const gravado = {
      titulo: 'Proposta',
      status: 'rascunho',
      ativo: true,
      vendedorId: 'v1',
      condicaoPagamentoId: 'c1',
      observacao: null,
      dataValidade: new Date('2026-11-20T03:00:00Z'),
    };

    it('efetivar (só status) não é alteração', () => {
      expect(cabecalhoMudou({ status: 'aprovado' }, gravado)).toBe(false);
    });

    it('formulário reenviando tudo igual não é alteração', () => {
      expect(
        cabecalhoMudou(
          {
            titulo: 'Proposta',
            status: 'aprovado',
            ativo: true,
            vendedorId: 'v2',
            condicaoPagamentoId: 'c1',
            observacao: null,
            dataValidade: new Date('2026-11-20T00:00:00Z'),
            dataRetorno: undefined,
          },
          gravado,
        ),
      ).toBe(false);
    });

    it('trocar condição, data ou observação é alteração', () => {
      expect(cabecalhoMudou({ condicaoPagamentoId: 'c2' }, gravado)).toBe(true);
      expect(
        cabecalhoMudou({ dataValidade: new Date('2026-11-21') }, gravado),
      ).toBe(true);
      expect(cabecalhoMudou({ observacao: 'urgente' }, gravado)).toBe(true);
    });
  });
});

import { resolverRegrasDescontoDosItens } from './resolver-regra-desconto-item';

const regra = (id: string) => ({
  id,
  codigoErp: id,
  descricao: id,
  percDescontoMaximo: 10,
  percDescontoAutorizado: 5,
  faixas: [],
});

describe('resolverRegrasDescontoDosItens — precedência (decisão de 2026-10-13)', () => {
  const tx = {
    tabelaPrecoItem: {
      findMany: jest.fn().mockResolvedValue([
        { produtoId: 'com-regra-no-produto', regraDesconto: regra('TABELA') },
        { produtoId: 'sem-regra-no-produto', regraDesconto: regra('TABELA') },
      ]),
    },
    produto: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'com-regra-no-produto',
          regraDesconto: regra('PRODUTO'),
          categoria: { regraDesconto: regra('CATEGORIA') },
        },
        {
          id: 'sem-regra-no-produto',
          regraDesconto: null,
          categoria: { regraDesconto: regra('CATEGORIA') },
        },
        {
          id: 'so-categoria',
          regraDesconto: null,
          categoria: { regraDesconto: regra('CATEGORIA') },
        },
        { id: 'nada', regraDesconto: null, categoria: null },
      ]),
    },
    regraDesconto: { findFirst: jest.fn().mockResolvedValue(regra('PADRAO')) },
  };

  it('produto preenchido vence a tabela; vazio, vale a tabela; depois categoria e padrão', async () => {
    const r = await resolverRegrasDescontoDosItens(
      tx as never,
      'e1',
      ['com-regra-no-produto', 'sem-regra-no-produto', 'so-categoria', 'nada'],
      'tabela-1',
    );

    expect(r.get('com-regra-no-produto')?.id).toBe('PRODUTO');
    expect(r.get('sem-regra-no-produto')?.id).toBe('TABELA');
    expect(r.get('so-categoria')?.id).toBe('CATEGORIA');
    expect(r.get('nada')?.id).toBe('PADRAO');
  });
});

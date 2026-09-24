import {
  integracaoClienteCreateSchema,
  integracaoEstoqueCreateSchema,
  integracaoNotaEntradaCreateSchema,
  integracaoNotaSaidaCreateSchema,
  integracaoObjetivoCreateSchema,
  integracaoOrcamentoCreateSchema,
  integracaoProdutoCreateSchema,
} from '@plataforma/contracts';

describe('normalização global de chaves da integração', () => {
  it('trata sentinelas e chaves incompletas opcionais como null', () => {
    expect(
      integracaoClienteCreateSchema.parse({
        chave: '01-000001-01',
        razaoSocial: 'CLIENTE TESTE',
        vendedorChave: '---',
        tabelaPrecoChave: '-',
        condicaoPagamentoChave: '01-',
      }),
    ).toEqual(
      expect.objectContaining({
        vendedorChave: null,
        tabelaPrecoChave: null,
        condicaoPagamentoChave: null,
      }),
    );

    expect(
      integracaoProdutoCreateSchema.parse({
        chave: '01-P001',
        descricao: 'PRODUTO TESTE',
        categoriaChave: '-',
        subCategoriaChave: '01-',
        armazemChave: '---',
        fabricanteChave: '-',
        regraDescontoChave: '01-',
      }),
    ).toEqual(
      expect.objectContaining({
        categoriaChave: null,
        subCategoriaChave: null,
        armazemChave: null,
        fabricanteChave: null,
        regraDescontoChave: null,
      }),
    );

    expect(
      integracaoNotaSaidaCreateSchema.parse({
        chave: '01-NF-1',
        numero: '1',
        clienteChave: '-',
        vendedorChave: '01-',
        condicaoChave: '---',
      }),
    ).toEqual(
      expect.objectContaining({
        clienteChave: null,
        vendedorChave: null,
        condicaoChave: null,
      }),
    );

    expect(
      integracaoNotaEntradaCreateSchema.parse({
        chave: '01-NE-1',
        numero: '1',
        fornecedorChave: '-',
        clienteChave: '01-',
        condicaoChave: '---',
      }),
    ).toEqual(
      expect.objectContaining({
        fornecedorChave: null,
        clienteChave: null,
        condicaoChave: null,
      }),
    );
  });

  it('recusa sentinela quando a referência é obrigatória', () => {
    expect(
      integracaoEstoqueCreateSchema.safeParse({
        chave: '01-P001-01',
        produtoChave: '-',
        armazemChave: '01-01',
        saldo: 1,
        dataEnvio: '2026-09-24T12:00:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      integracaoObjetivoCreateSchema.safeParse({
        chave: '01-V001-2026-09',
        vendedorChave: '01-',
        mes: 9,
        ano: 2026,
      }).success,
    ).toBe(false);

    expect(
      integracaoOrcamentoCreateSchema.safeParse({
        chave: '01-O001',
        clienteChave: '-',
        vendedorChave: '01-V001',
        titulo: 'ORÇAMENTO TESTE',
      }).success,
    ).toBe(false);
  });
});

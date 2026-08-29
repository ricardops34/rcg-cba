import {
  integracaoNotaSaidaItemSchema,
  integracaoOrcamentoItemSchema,
  integracaoTabelaPrecoItemSchema,
} from '@plataforma/contracts';

describe('contratos de exclusao de itens da integracao', () => {
  it.each([
    ['tabela de preco', integracaoTabelaPrecoItemSchema],
    ['nota de saida', integracaoNotaSaidaItemSchema],
    ['orcamento', integracaoOrcamentoItemSchema],
  ])('aceita delete booleano nos itens de %s', (_nome, schema) => {
    expect(schema.partial().parse({ delete: true })).toEqual({ delete: true });
    expect(() => schema.partial().parse({ delete: 'DELETE' })).toThrow();
  });
});

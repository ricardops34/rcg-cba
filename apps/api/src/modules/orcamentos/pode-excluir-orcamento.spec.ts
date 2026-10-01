import { podeExcluirOrcamento } from '@plataforma/contracts';

// Só se exclui orçamento sem integração (decisão do usuário, 01/10/2026).
describe('podeExcluirOrcamento', () => {
  const base = {
    status: 'rascunho' as const,
    chave: null,
    codigoErp: null,
    situacaoErp: null,
    erroIntegracao: null,
    origem: 'vendedor' as const,
  };

  it.each(['rascunho', 'enviado', 'recusado', 'expirado'] as const)(
    'não enviado ao ERP (%s) pode',
    (status) => {
      expect(podeExcluirOrcamento({ ...base, status })).toBe(true);
    },
  );

  it('recusado pelo ERP pode: o pedido nunca existiu', () => {
    expect(
      podeExcluirOrcamento({
        ...base,
        status: 'aprovado',
        erroIntegracao: 'MATA410: produto bloqueado',
      }),
    ).toBe(true);
  });

  it('aguardando integração não pode: o ERP pode estar gravando o pedido', () => {
    expect(podeExcluirOrcamento({ ...base, status: 'aprovado' })).toBe(false);
  });

  it('vinculado a um pedido não pode', () => {
    expect(
      podeExcluirOrcamento({ ...base, status: 'aprovado', chave: '01-004512' }),
    ).toBe(false);
  });

  it('com situação do pedido, mesmo cancelado, não pode', () => {
    expect(
      podeExcluirOrcamento({
        ...base,
        status: 'aprovado',
        chave: '01-004512',
        situacaoErp: 'cancelado',
      }),
    ).toBe(false);
  });

  it('histórico do ERP não pode', () => {
    expect(
      podeExcluirOrcamento({
        ...base,
        status: 'aprovado',
        origem: 'erp',
        chave: '01-004513',
        situacaoErp: 'faturado',
      }),
    ).toBe(false);
  });
});

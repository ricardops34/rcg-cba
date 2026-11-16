import { rotaDaAtividade } from './rota-da-atividade';

describe('rotaDaAtividade', () => {
  it('pendência de desconto abre o orçamento na aba de aprovação', () => {
    expect(
      rotaDaAtividade({
        id: 'a1',
        titulo: 'Autorização de desconto solicitada — orçamento nº 63',
        orcamentoId: 'o1',
      }),
    ).toBe('/crm/orcamentos/o1?aba=integracao');
  });

  it('outra tarefa do orçamento abre a atividade', () => {
    expect(
      rotaDaAtividade({
        id: 'a1',
        titulo: 'Retorno do orçamento nº 63',
        orcamentoId: 'o1',
      }),
    ).toBe('/crm/atividades/a1');
  });

  it('tarefa sem orçamento abre a atividade', () => {
    expect(
      rotaDaAtividade({
        id: 'a1',
        titulo: 'Autorização de desconto solicitada',
        orcamentoId: null,
      }),
    ).toBe('/crm/atividades/a1');
  });
});

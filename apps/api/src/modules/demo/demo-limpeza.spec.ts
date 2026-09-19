import { conferirClassificacao } from './demo-limpeza';

/**
 * A trava que mantém a limpeza correta com o tempo.
 *
 * Roda sobre o DMMF do Prisma, sem banco. O que ela pega é o caso que ninguém
 * percebe na revisão: alguém cria uma tabela de negócio nova com `empresaId`,
 * ninguém lembra desta lista, e a limpeza passa a deixar dado para trás em
 * silêncio — uma demonstração que começa com cliente de outro assunto no meio.
 */
describe('classificação da limpeza de base', () => {
  const { naoClassificados, duplicados } = conferirClassificacao();

  it('toda tabela com empresaId está numa das duas listas', () => {
    expect(naoClassificados).toEqual([]);
  });

  it('nenhuma tabela está nas duas listas ao mesmo tempo', () => {
    expect(duplicados).toEqual([]);
  });
});

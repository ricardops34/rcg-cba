import { calcularDiff, CAMPO_CNAES } from './cliente-alteracoes.service';

/**
 * O diff é o que a fila de aprovação mostra e o que ela aplica — errar aqui
 * significa propor mudança que ninguém pediu, ou perder a que pediram.
 */
describe('calcularDiff', () => {
  it('ignora campo que o payload não trouxe', () => {
    // É o que faz o ERP reenviar o cadastro inteiro sem encher a fila.
    expect(calcularDiff({ razaoSocial: 'A', telefone: '99' }, {})).toEqual({});
  });

  it('ignora campo com o mesmo valor', () => {
    expect(
      calcularDiff({ razaoSocial: 'ACME' }, { razaoSocial: 'ACME' }),
    ).toEqual({});
  });

  describe(`campo virtual ${CAMPO_CNAES}`, () => {
    it('compara como lista ordenada de códigos', () => {
      const diff = calcularDiff(
        { cnaes: ['4721102'] },
        { cnaes: ['4639701', '4721102'] },
      );
      expect(diff[CAMPO_CNAES]).toEqual({
        de: '4721102',
        para: '4639701, 4721102',
      });
    });

    it('não propõe nada quando a lista é a mesma fora de ordem', () => {
      const diff = calcularDiff(
        { cnaes: ['4721102', '4639701'] },
        { cnaes: ['4639701', '4721102'] },
      );
      expect(diff[CAMPO_CNAES]).toBeUndefined();
    });

    it('nunca propõe esvaziar o ramo do cliente', () => {
      // A Receita não conhecer nenhum CNAE não é motivo para apagar o que o
      // cadastro já tem — `para` nulo é descartado.
      const diff = calcularDiff({ cnaes: ['4721102'] }, { cnaes: [] });
      expect(diff[CAMPO_CNAES]).toBeUndefined();
    });

    it('preenche o cliente que ainda não tem ramo nenhum', () => {
      const diff = calcularDiff({ cnaes: [] }, { cnaes: ['4639701'] });
      expect(diff[CAMPO_CNAES]).toEqual({ de: null, para: '4639701' });
    });
  });
});

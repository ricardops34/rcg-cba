import { calcularDiff, CAMPO_CNAE_PRINCIPAL, CAMPO_CNAES } from './cliente-alteracoes.service';

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

  describe('endereço que só muda na escrita', () => {
    it('abreviatura do tipo e pontuação não são alteração', () => {
      expect(
        calcularDiff(
          { endereco: 'AV. ZILA CORREA MACHADO,11440' },
          { endereco: 'AVENIDA ZILA CORREA MACHADO, 11440' },
        ),
      ).toEqual({});
      expect(
        calcularDiff(
          { endereco: 'R. Ada Teixeira dos Santos, 99' },
          { endereco: 'RUA ADA TEIXEIRA DOS SANTOS, 99' },
        ),
      ).toEqual({});
    });

    it('nome ou número diferente continua sendo alteração', () => {
      expect(
        calcularDiff(
          { endereco: 'R. ADA TEIXEIRA DOS SANTOS, 99' },
          { endereco: 'R. ADA TEIXEIRA DOS SANTOS PEREIRA, 99' },
        ).endereco,
      ).toBeDefined();
      expect(
        calcularDiff(
          { endereco: 'AV. ZILA CORREA MACHADO, 11440' },
          { endereco: 'AV. ZILA CORREA MACHADO, 11450' },
        ).endereco,
      ).toBeDefined();
    });

    it('tipo diferente continua sendo alteração', () => {
      expect(
        calcularDiff(
          { endereco: 'R. BRASIL, 10' },
          { endereco: 'AV. BRASIL, 10' },
        ).endereco,
      ).toBeDefined();
    });
  });

  describe('texto que só muda no acento, no Ç ou na caixa', () => {
    it('não é alteração', () => {
      expect(
        calcularDiff(
          { razaoSocial: 'PAÇOCA COMÉRCIO LTDA', bairro: 'São José' },
          { razaoSocial: 'PACOCA COMERCIO LTDA', bairro: 'SAO JOSE' },
        ),
      ).toEqual({});
      expect(
        calcularDiff(
          { endereco: 'R. CONCEIÇÃO, 5' },
          { endereco: 'RUA CONCEICAO, 5' },
        ),
      ).toEqual({});
    });

    it('palavra diferente continua sendo alteração', () => {
      expect(
        calcularDiff(
          { razaoSocial: '7M ALIMENTOS LTDA' },
          { razaoSocial: 'GRANEL NUTRI LTDA' },
        ).razaoSocial,
      ).toBeDefined();
    });
  });

  it('telefone que só difere no zero do DDD não é alteração', () => {
    expect(
      calcularDiff({ telefone: '06733546642' }, { telefone: '6733546642' }),
    ).toEqual({});
    expect(
      calcularDiff({ celular: '067999358925' }, { celular: '6733989160' })
        .celular,
    ).toBeDefined();
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

  describe(`campo virtual ${CAMPO_CNAE_PRINCIPAL}`, () => {
    it('propõe trocar o principal pelo da Receita', () => {
      const diff = calcularDiff({ cnaePrincipal: '4721102' }, { cnaePrincipal: '4639701' });
      expect(diff[CAMPO_CNAE_PRINCIPAL]).toEqual({ de: '4721102', para: '4639701' });
    });

    it('não propõe nada quando o principal já é o mesmo', () => {
      const diff = calcularDiff({ cnaePrincipal: '4639701' }, { cnaePrincipal: '4639701' });
      expect(diff[CAMPO_CNAE_PRINCIPAL]).toBeUndefined();
    });
  });
});

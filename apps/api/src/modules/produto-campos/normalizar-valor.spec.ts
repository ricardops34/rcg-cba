import { BadRequestException } from '@nestjs/common';
import { normalizarValorDoCampo } from './normalizar-valor';

/**
 * O valor de um campo complementar é gravado como **texto**, então esta função
 * é a única coisa entre o que alguém digita e o que a tela, os relatórios e a
 * IA vão ler depois. Um cadastro onde "peso" às vezes é `12,5`, às vezes
 * `12.5` e às vezes "mais ou menos 12" não serve para nada.
 *
 * Os testes prendem as duas metades: o que **entra** (o jeito de digitar em
 * português) e o que **fica gravado** (um formato só).
 */
describe('normalizarValorDoCampo', () => {
  describe('número', () => {
    it('aceita a vírgula decimal, que é como se digita aqui', () => {
      expect(normalizarValorDoCampo('numero', [], '12,5', 'Peso')).toBe('12.5');
    });

    it('entende o ponto como separador de milhar quando há vírgula', () => {
      // Sem isto, "1.234,5" viraria NaN e "1.234" entraria como mil vezes
      // menos do que a pessoa quis dizer.
      expect(normalizarValorDoCampo('numero', [], '1.234,5', 'Peso')).toBe(
        '1234.5',
      );
    });

    it('aceita o ponto decimal de quem digita como a máquina grava', () => {
      expect(normalizarValorDoCampo('numero', [], '12.5', 'Peso')).toBe('12.5');
    });

    it('recusa o que não é número, com o nome do campo no erro', () => {
      expect(() =>
        normalizarValorDoCampo('numero', [], 'mais ou menos 12', 'Peso'),
      ).toThrow(BadRequestException);
      expect(() =>
        normalizarValorDoCampo('numero', [], 'mais ou menos 12', 'Peso'),
      ).toThrow(/Peso/);
    });
  });

  describe('booleano', () => {
    it('aceita as formas que se digitam', () => {
      for (const sim of ['sim', 'Sim', 'S', 'true', '1', 'x']) {
        expect(normalizarValorDoCampo('booleano', [], sim, 'Inflamável')).toBe(
          'true',
        );
      }
      for (const nao of ['não', 'nao', 'N', 'false', '0']) {
        expect(normalizarValorDoCampo('booleano', [], nao, 'Inflamável')).toBe(
          'false',
        );
      }
    });

    it('recusa o meio-termo em vez de escolher por conta própria', () => {
      expect(() =>
        normalizarValorDoCampo('booleano', [], 'talvez', 'Inflamável'),
      ).toThrow(BadRequestException);
    });
  });

  describe('data', () => {
    it('aceita o formato brasileiro e o do <input type="date">', () => {
      expect(normalizarValorDoCampo('data', [], '31/12/2026', 'Validade')).toBe(
        '2026-12-31',
      );
      expect(normalizarValorDoCampo('data', [], '2026-12-31', 'Validade')).toBe(
        '2026-12-31',
      );
    });

    it('recusa dia que não existe', () => {
      // `new Date('2026-02-31')` não é inválida em JavaScript: ela **rola**
      // para 3 de março. Sem comparar a volta, 31/02 entraria no cadastro.
      expect(() =>
        normalizarValorDoCampo('data', [], '31/02/2026', 'Validade'),
      ).toThrow(BadRequestException);
    });

    it('recusa texto que não é data', () => {
      expect(() =>
        normalizarValorDoCampo('data', [], 'ano que vem', 'Validade'),
      ).toThrow(BadRequestException);
    });
  });

  describe('lista', () => {
    const opcoes = ['Concentrado', 'Pronto para uso'];

    it('grava a opção como cadastrada, não como digitada', () => {
      // Senão o mesmo valor aparece de três jeitos ao filtrar por ele depois.
      expect(
        normalizarValorDoCampo('lista', opcoes, 'concentrado', 'Apresentação'),
      ).toBe('Concentrado');
    });

    it('recusa o que não está na lista e diz quais são as opções', () => {
      expect(() =>
        normalizarValorDoCampo('lista', opcoes, 'diluído', 'Apresentação'),
      ).toThrow(/Concentrado, Pronto para uso/);
    });
  });

  describe('texto', () => {
    it('passa direto — é o tipo que não promete nada', () => {
      expect(
        normalizarValorDoCampo('texto', [], '1:100 em água morna', 'Diluição'),
      ).toBe('1:100 em água morna');
      expect(
        normalizarValorDoCampo('texto_longo', [], 'Linha 1\nLinha 2', 'Modo'),
      ).toBe('Linha 1\nLinha 2');
    });
  });
});

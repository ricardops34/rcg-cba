import {
  abreviarTipoLogradouro,
  enderecoCanonico,
  textoCanonico,
} from './endereco-equivalente';

describe('abreviarTipoLogradouro', () => {
  it('abrevia como o cadastro grava', () => {
    expect(abreviarTipoLogradouro('AVENIDA')).toBe('AV.');
    expect(abreviarTipoLogradouro('Rua')).toBe('R.');
    expect(abreviarTipoLogradouro('PRAÇA')).toBe('PC.');
  });

  it('tipo fora da tabela volta por extenso', () => {
    expect(abreviarTipoLogradouro('SERVIDÃO')).toBe('SERVIDÃO');
  });
});

describe('enderecoCanonico', () => {
  it('não confunde nome de rua com tipo quando é a única palavra', () => {
    expect(enderecoCanonico('RUA')).not.toBe(enderecoCanonico('R.'));
  });
});

describe('textoCanonico', () => {
  it('tira acento e cedilha', () => {
    expect(textoCanonico('Paçoca  Comércio ')).toBe('PACOCA COMERCIO');
  });
});

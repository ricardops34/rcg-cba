import { normalizarChaveOpcional } from './normalizar-chave-opcional';

describe('normalizarChaveOpcional', () => {
  it.each([undefined, null, '', '   ', '-', '01-', '01-   '])(
    'trata %p como ausência de vínculo',
    (chave) => {
      expect(normalizarChaveOpcional(chave)).toBeNull();
    },
  );

  it('preserva uma chave completa', () => {
    expect(normalizarChaveOpcional(' 01-001 ')).toBe('01-001');
  });
});

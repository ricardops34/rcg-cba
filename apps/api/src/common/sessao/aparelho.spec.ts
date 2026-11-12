import { aparelhoDoNavegador } from './aparelho';

describe('aparelhoDoNavegador', () => {
  it.each([
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      'celular',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
      'celular',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
      'computador',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      'computador',
    ],
    // Tablet Android sem "Mobile": tela grande, sistema inteiro.
    [
      'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
      'computador',
    ],
  ])('%s → %s', (ua, esperado) => {
    expect(aparelhoDoNavegador(ua)).toBe(esperado);
  });

  it('sem User-Agent conta como computador', () => {
    expect(aparelhoDoNavegador(null)).toBe('computador');
    expect(aparelhoDoNavegador(undefined)).toBe('computador');
  });
});

import { comprimento, distanciaMetros, ordenarParadas } from './rotas-ordem';

describe('rotas-ordem', () => {
  it('distância entre dois pontos conhecidos (~111 km por grau de latitude)', () => {
    const d = distanciaMetros(
      { latitude: -20, longitude: -54 },
      { latitude: -21, longitude: -54 },
    );
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('ordena paradas em linha pela proximidade, sem zigue-zague', () => {
    const origem = { latitude: 0, longitude: 0 };
    // Fora de ordem de propósito: 3, 1, 4, 2 ao longo do eixo.
    const paradas = [
      { latitude: 0, longitude: 0.03 },
      { latitude: 0, longitude: 0.01 },
      { latitude: 0, longitude: 0.04 },
      { latitude: 0, longitude: 0.02 },
    ];
    expect(ordenarParadas(origem, paradas, false)).toEqual([1, 3, 0, 2]);
  });

  it('2-opt nunca piora o vizinho mais próximo', () => {
    const origem = { latitude: -20.46, longitude: -54.62 };
    const paradas = Array.from({ length: 12 }, (_, i) => ({
      latitude: -20.46 + Math.sin(i * 1.7) * 0.05,
      longitude: -54.62 + Math.cos(i * 2.3) * 0.05,
    }));
    const ordem = ordenarParadas(origem, paradas, true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(paradas.map((_, i) => i));
    const naOrdemDada = comprimento(origem, paradas, true);
    const otimizada = comprimento(
      origem,
      ordem.map((i) => paradas[i]),
      true,
    );
    expect(otimizada).toBeLessThanOrEqual(naOrdemDada);
  });
});

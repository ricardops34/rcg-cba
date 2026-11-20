import type { GeometriaRegiao } from '@plataforma/contracts';
import {
  avaliarInvasao,
  fecharAneis,
  pontoNaGeometria,
  type RegiaoParaAvaliar,
} from './regioes-geo';

// Quadrado de 1° x 1° em torno de (-20.5, -54.5), com um buraco no meio.
const quadrado: GeometriaRegiao = {
  type: 'Polygon',
  coordinates: [
    [
      [-55, -21],
      [-54, -21],
      [-54, -20],
      [-55, -20],
    ],
    [
      [-54.6, -20.6],
      [-54.4, -20.6],
      [-54.4, -20.4],
      [-54.6, -20.4],
    ],
  ],
};

describe('pontoNaGeometria', () => {
  it('dentro, fora e no buraco', () => {
    expect(pontoNaGeometria(-20.2, -54.8, quadrado)).toBe(true);
    expect(pontoNaGeometria(-22, -54.5, quadrado)).toBe(false);
    expect(pontoNaGeometria(-20.5, -54.5, quadrado)).toBe(false);
  });

  it('MultiPolygon vale qualquer parte', () => {
    const multi: GeometriaRegiao = {
      type: 'MultiPolygon',
      coordinates: [
        [quadrado.coordinates[0]],
        [
          [
            [-50, -10],
            [-49, -10],
            [-49, -9],
          ],
        ],
      ],
    };
    expect(pontoNaGeometria(-9.8, -49.2, multi)).toBe(true);
  });

  it('fecharAneis repete o primeiro ponto no fim', () => {
    const g = fecharAneis(quadrado);
    const anel = (g.coordinates as [number, number][][])[0];
    expect(anel[anel.length - 1]).toEqual(anel[0]);
  });
});

describe('avaliarInvasao', () => {
  const area = (
    id: string,
    vendedorId: string | null,
    geometria: GeometriaRegiao = quadrado,
  ): RegiaoParaAvaliar => ({
    id,
    nome: id,
    vendedorId,
    vendedorNome: vendedorId,
    tipo: 'area',
    municipioChave: null,
    geometria,
  });
  const municipio = (
    id: string,
    vendedorId: string | null,
  ): RegiaoParaAvaliar => ({
    id,
    nome: id,
    vendedorId,
    vendedorNome: vendedorId,
    tipo: 'municipio',
    municipioChave: 'CAMPO GRANDE|MS',
    geometria: null,
  });
  const cliente = (vendedorId: string, lat: number | null = -20.2) => ({
    latitude: lat,
    longitude: lat == null ? null : -54.8,
    municipio: 'Campo Grande',
    uf: 'MS',
    vendedorId,
  });

  it('cliente de B na área de A é invasão', () => {
    const r = avaliarInvasao(cliente('B'), [area('a1', 'A')]);
    expect(r?.invasoras.map((x) => x.id)).toEqual(['a1']);
  });

  it('cliente na própria área, ou em área livre, não é', () => {
    expect(avaliarInvasao(cliente('A'), [area('a1', 'A')])).toBeNull();
    expect(avaliarInvasao(cliente('B'), [area('livre', null)])).toBeNull();
  });

  it('área vence o município: bairro de B dentro do município de A', () => {
    expect(
      avaliarInvasao(cliente('B'), [municipio('m1', 'A'), area('a1', 'B')]),
    ).toBeNull();
  });

  it('sem coordenada, vale o nome do município do cadastro', () => {
    const r = avaliarInvasao(cliente('B', null), [municipio('m1', 'A')]);
    expect(r?.porMunicipio).toBe(true);
    expect(r?.invasoras.map((x) => x.id)).toEqual(['m1']);
  });
});

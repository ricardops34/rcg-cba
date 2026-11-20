import type { GeometriaRegiao } from '@plataforma/contracts';

/**
 * Geometria das regiões de atuação (funções puras, para o teste).
 * Coordenadas GeoJSON: [longitude, latitude].
 */

type Anel = Array<[number, number]>;

/** Ray casting: o ponto está dentro do anel? Borda conta como dentro ou fora, tanto faz. */
function dentroDoAnel(lng: number, lat: number, anel: Anel): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      dentro = !dentro;
    }
  }
  return dentro;
}

/** Polígono = contorno e buracos: dentro do contorno e fora de todo buraco. */
function dentroDoPoligono(lng: number, lat: number, aneis: Anel[]): boolean {
  if (!aneis.length || !dentroDoAnel(lng, lat, aneis[0])) return false;
  return !aneis.slice(1).some((buraco) => dentroDoAnel(lng, lat, buraco));
}

export function pontoNaGeometria(
  latitude: number,
  longitude: number,
  g: GeometriaRegiao,
): boolean {
  if (g.type === 'Polygon') {
    return dentroDoPoligono(longitude, latitude, g.coordinates);
  }
  return g.coordinates.some((p) => dentroDoPoligono(longitude, latitude, p));
}

/** Fecha os anéis (último ponto = primeiro), como pede o GeoJSON. */
export function fecharAneis(g: GeometriaRegiao): GeometriaRegiao {
  const fechar = (anel: Anel): Anel => {
    const [x0, y0] = anel[0];
    const [xn, yn] = anel[anel.length - 1];
    return x0 === xn && y0 === yn ? anel : [...anel, [x0, y0]];
  };
  return g.type === 'Polygon'
    ? { type: 'Polygon', coordinates: (g.coordinates as Anel[]).map(fechar) }
    : {
        type: 'MultiPolygon',
        coordinates: (g.coordinates as Anel[][]).map((p) => p.map(fechar)),
      };
}

/** Nome comparável: sem acento, caixa, pontuação. */
export const normalizarNome = (v: string | null | undefined) =>
  (v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

export type RegiaoParaAvaliar = {
  id: string;
  nome: string;
  vendedorId: string | null;
  vendedorNome: string | null;
  tipo: 'area' | 'municipio';
  /** Nome normalizado + UF do município (tipo municipio). */
  municipioChave: string | null;
  geometria: GeometriaRegiao | null;
};

export type ClienteParaAvaliar = {
  latitude: number | null;
  longitude: number | null;
  municipio: string | null;
  uf: string | null;
  vendedorId: string;
};

/**
 * As regiões que valem para o cliente. A área desenhada é mais específica que
 * o município: se o cliente está em alguma área, só as áreas contam (assim
 * dá para recortar um bairro de outro vendedor dentro do município de um).
 * Sem área, contam os municípios — pela divisa quando há coordenada, pelo
 * nome do município do cadastro quando não há.
 */
export function regioesDoCliente(
  c: ClienteParaAvaliar,
  regioes: RegiaoParaAvaliar[],
): { regioes: RegiaoParaAvaliar[]; porMunicipio: boolean } {
  const temPonto =
    c.latitude != null &&
    c.longitude != null &&
    !(c.latitude === 0 && c.longitude === 0);

  if (temPonto) {
    const areas = regioes.filter(
      (r) =>
        r.tipo === 'area' &&
        r.geometria &&
        pontoNaGeometria(c.latitude!, c.longitude!, r.geometria),
    );
    if (areas.length) return { regioes: areas, porMunicipio: false };
  }

  const chave = `${normalizarNome(c.municipio)}|${(c.uf ?? '').toUpperCase()}`;
  const municipios = regioes.filter((r) => {
    if (r.tipo !== 'municipio') return false;
    if (temPonto && r.geometria) {
      return pontoNaGeometria(c.latitude!, c.longitude!, r.geometria);
    }
    return r.municipioChave === chave;
  });
  // "Por município" só quando foi o nome que decidiu (sem ponto ou sem divisa).
  const porMunicipio =
    municipios.length > 0 &&
    (!temPonto || municipios.some((r) => !r.geometria));
  return { regioes: municipios, porMunicipio };
}

/**
 * Invasão: o cliente está em região(ões) com dono e nenhuma é do vendedor da
 * carteira. Região livre não conta; se uma das regiões é do próprio
 * vendedor, não há invasão.
 */
export function avaliarInvasao(
  c: ClienteParaAvaliar,
  regioes: RegiaoParaAvaliar[],
): { invasoras: RegiaoParaAvaliar[]; porMunicipio: boolean } | null {
  const achadas = regioesDoCliente(c, regioes);
  const comDono = achadas.regioes.filter((r) => r.vendedorId);
  if (!comDono.length) return null;
  if (comDono.some((r) => r.vendedorId === c.vendedorId)) return null;
  return { invasoras: comDono, porMunicipio: achadas.porMunicipio };
}

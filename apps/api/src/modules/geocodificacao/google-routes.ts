/**
 * Chamada única à Google Routes API (computeRoutes), usada pelas rotas de
 * visita e pelo "Calcular rota" da aba Mapa do cliente (20/11/2026). Não
 * lança: falha vira `{ ok: false, motivo }` em português.
 */
export type PontoRota = { latitude: number; longitude: number };

/** Distância em linha reta, em metros (haversine). */
export function distanciaLinhaReta(a: PontoRota, b: PontoRota): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ROUTES_CAMPOS =
  'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.optimizedIntermediateWaypointIndex';

const latLng = (p: PontoRota) => ({
  location: { latLng: { latitude: p.latitude, longitude: p.longitude } },
});

/** O que fazer quando a Routes API recusa, em português. */
export function explicarErroRoutes(status: string, mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes('billing')) {
    return 'o projeto no Google Cloud está sem faturamento';
  }
  if (
    status === 'PERMISSION_DENIED' ||
    m.includes('not been used') ||
    m.includes('disabled')
  ) {
    return 'a Routes API não está ativada no projeto ou não está liberada na chave';
  }
  if (m.includes('api key')) return 'a chave do Google foi recusada';
  return `${status}: ${mensagem}`;
}

export type ResultadoRoutes =
  | {
      ok: true;
      distanciaMetros: number | null;
      duracaoSegundos: number | null;
      polilinha: string | null;
      /** Índices de `intermediarios` na ordem otimizada (quando otimizar). */
      ordemIntermediarios: number[] | null;
    }
  | { ok: false; motivo: string };

export async function calcularRotaGoogle(
  chave: string,
  origem: PontoRota,
  destino: PontoRota,
  intermediarios: PontoRota[] = [],
  otimizar = false,
): Promise<ResultadoRoutes> {
  try {
    const resposta = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': chave,
        'X-Goog-FieldMask': ROUTES_CAMPOS,
      },
      body: JSON.stringify({
        origin: latLng(origem),
        destination: latLng(destino),
        intermediates: intermediarios.map(latLng),
        travelMode: 'DRIVE',
        optimizeWaypointOrder: otimizar && intermediarios.length > 1,
        languageCode: 'pt-BR',
        units: 'METRIC',
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const corpo = (await resposta.json().catch(() => null)) as {
      error?: { status?: string; message?: string };
      routes?: Array<{
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
        optimizedIntermediateWaypointIndex?: number[];
      }>;
    } | null;
    const rota = corpo?.routes?.[0];
    if (!resposta.ok || !rota) {
      return {
        ok: false,
        motivo: explicarErroRoutes(
          corpo?.error?.status ?? `HTTP ${resposta.status}`,
          corpo?.error?.message ?? 'sem rota',
        ),
      };
    }
    return {
      ok: true,
      distanciaMetros: rota.distanceMeters ?? null,
      duracaoSegundos: rota.duration
        ? Math.round(parseFloat(rota.duration))
        : null,
      polilinha: rota.polyline?.encodedPolyline ?? null,
      ordemIntermediarios:
        rota.optimizedIntermediateWaypointIndex?.length ===
        intermediarios.length
          ? rota.optimizedIntermediateWaypointIndex
          : null,
    };
  } catch (erro) {
    return {
      ok: false,
      motivo: `sem resposta do Google (${(erro as Error).message})`,
    };
  }
}

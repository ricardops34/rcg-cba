import { z } from "zod";

/**
 * Rotas de visita (Gerencial > Mapa e Rotas, 20/11/2026 —
 * docs/planos/2026-11-20-mapas-clientes-rotas.md). O caminho vem da Google
 * Routes API quando ligada em Administração > Geolocalização (GEO_ROTAS_GOOGLE),
 * senão da ordem por proximidade em linha reta. Cada parada vira uma atividade
 * `visita` na Agenda do vendedor; visita feita = atividade concluída.
 */
export const ROTA_MAX_PARADAS_GOOGLE = 25;
export const ROTA_MAX_PARADAS = 60;

const pontoSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const rotaVisitaCalcularSchema = z.object({
  origem: pontoSchema,
  clienteIds: z.array(z.string().uuid()).min(1, "Escolha ao menos um cliente").max(ROTA_MAX_PARADAS),
  /** Volta ao ponto de partida no fim. */
  retornar: z.boolean().default(true),
});
export type RotaVisitaCalcular = z.infer<typeof rotaVisitaCalcularSchema>;

export type RotaVisitaCalculo = {
  calculadaPor: "google" | "linha_reta";
  /** Os clientes na ordem da visita. */
  clienteIds: string[];
  distanciaMetros: number | null;
  duracaoSegundos: number | null;
  /** Caminho pelas ruas (encoded polyline do Google); nulo na linha reta. */
  polilinha: string | null;
  /** Por que não foi pelo Google (desligado, chave recusada, mais de 25 paradas). */
  aviso: string | null;
};

export const rotaVisitaCreateSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome à rota").max(100),
  vendedorId: z.string().uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  origem: pontoSchema,
  retornar: z.boolean(),
  /** Já na ordem da visita. */
  clienteIds: z.array(z.string().uuid()).min(1).max(ROTA_MAX_PARADAS),
  calculadaPor: z.enum(["google", "linha_reta"]),
  distanciaMetros: z.number().int().nonnegative().nullable(),
  duracaoSegundos: z.number().int().nonnegative().nullable(),
  polilinha: z.string().max(200_000).nullable(),
});
export type RotaVisitaCreate = z.infer<typeof rotaVisitaCreateSchema>;

export const rotaVisitaQuerySchema = z.object({
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  vendedorId: z.string().uuid().optional(),
});
export type RotaVisitaQuery = z.infer<typeof rotaVisitaQuerySchema>;

export type RotaVisitaResumo = {
  id: string;
  nome: string;
  data: string;
  vendedorId: string;
  vendedorNome: string;
  calculadaPor: "google" | "linha_reta";
  distanciaMetros: number | null;
  duracaoSegundos: number | null;
  total: number;
  /** Paradas com a visita concluída na Agenda. */
  feitas: number;
};

export type RotaVisitaParada = {
  ordem: number;
  clienteId: string;
  codigoErp: string | null;
  razaoSocial: string;
  endereco: string | null;
  municipio: string | null;
  uf: string | null;
  latitude: number | null;
  longitude: number | null;
  atividadeId: string | null;
  feita: boolean;
};

export type RotaVisitaDetalhe = RotaVisitaResumo & {
  origemLatitude: number;
  origemLongitude: number;
  retornar: boolean;
  polilinha: string | null;
  paradas: RotaVisitaParada[];
};

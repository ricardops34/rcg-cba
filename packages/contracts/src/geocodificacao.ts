import { z } from "zod";

/**
 * Coordenadas do cliente pela Geocoding API do Google ou pelo Nominatim
 * (OpenStreetMap), o que estiver configurado em GEO_PROVEDOR
 * (docs/planos/geocodificacao-clientes.md; Nominatim: decisão de 20/11/2026). A configuração são os parâmetros
 * GEO_* da empresa, editados juntos pela tela Administração > Geolocalização,
 * como os do SMS.
 */
export const GEOCODIFICACAO_PROVEDORES = ["google", "nominatim"] as const;
export type GeocodificacaoProvedor = (typeof GEOCODIFICACAO_PROVEDORES)[number];

export const GEOCODIFICACAO_PROVEDOR_ROTULO: Record<GeocodificacaoProvedor, string> = {
  google: "Google (Geocoding API)",
  nominatim: "OpenStreetMap (Nominatim)",
};

export const GEO_NOMINATIM_URL_PADRAO = "https://nominatim.openstreetmap.org/search";

export const geocodificacaoConfiguracaoUpdateSchema = z.object({
  ativo: z.boolean().describe("GEO_ATIVO — habilita a busca de coordenadas"),
  provedor: z
    .enum(GEOCODIFICACAO_PROVEDORES)
    .default("google")
    .describe("GEO_PROVEDOR — google (pago, precisa de chave) ou nominatim (gratuito)"),
  nominatimUrl: z
    .string()
    .trim()
    .url("Informe uma URL válida")
    .max(300)
    .default(GEO_NOMINATIM_URL_PADRAO)
    .describe("GEO_NOMINATIM_URL — endereço do serviço Nominatim"),
  url: z
    .string()
    .trim()
    .url("Informe uma URL válida")
    .max(300)
    .describe("GEO_URL — endereço da Geocoding API"),
  chave: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe("GEO_CHAVE — só quando for trocar; vazio mantém a atual"),
  aoSalvar: z
    .boolean()
    .describe("GEO_AO_SALVAR — busca ao salvar o cliente"),
  loteLimite: z.coerce
    .number()
    .int()
    .min(1, "No mínimo 1")
    .max(5000, "No máximo 5.000 por execução")
    .describe("GEO_LOTE_LIMITE — clientes por execução do lote"),
});
export type GeocodificacaoConfiguracaoUpdate = z.infer<
  typeof geocodificacaoConfiguracaoUpdateSchema
>;

export type GeocodificacaoConfiguracao = Omit<GeocodificacaoConfiguracaoUpdate, "chave"> & {
  chavePreenchida: boolean;
  /** Ativo e pronto para consultar (Google exige a chave; Nominatim, não). */
  habilitado: boolean;
  /** Clientes ativos sem coordenadas e com endereço, ainda não consultados. */
  pendentes: number;
  /** Clientes ativos sem coordenadas que o Google já consultou sem achar. */
  naoEncontrados: number;
  /** Leads abertos (novo/em atendimento) com endereço, sem coordenadas, não consultados. */
  leadsPendentes: number;
  leadsNaoEncontrados: number;
};

export const geocodificacaoTesteSchema = z.object({
  endereco: z.string().trim().min(5, "Informe um endereço").max(300),
});
export type GeocodificacaoTeste = z.infer<typeof geocodificacaoTesteSchema>;

export type GeocodificacaoTesteResultado = {
  encontrado: boolean;
  latitude: number | null;
  longitude: number | null;
  /** Endereço como o Google entendeu. */
  enderecoFormatado: string | null;
  /** ROOFTOP, RANGE_INTERPOLATED, GEOMETRIC_CENTER ou APPROXIMATE. */
  precisao: string | null;
};

export const geocodificacaoLoteSchema = z.object({
  /** Consulta de novo quem o Google já não achou. */
  incluirNaoEncontrados: z.boolean().default(false),
});
export type GeocodificacaoLoteBody = z.infer<typeof geocodificacaoLoteSchema>;

export type GeocodificacaoLoteSituacao = {
  rodando: boolean;
  iniciadoEm: string | null;
  concluidoEm: string | null;
  total: number;
  processados: number;
  encontrados: number;
  naoEncontrados: number;
  /** Clientes em que a consulta ou a gravação falhou. */
  erros: number;
  /** Motivo de o lote ter parado antes do fim (chave recusada, cota). */
  erro: string | null;
};

export const GEOCODIFICACAO_PRECISAO_ROTULO: Record<string, string> = {
  ROOFTOP: "Exata (número do imóvel)",
  RANGE_INTERPOLATED: "Aproximada no trecho da rua",
  GEOMETRIC_CENTER: "Centro da rua ou região",
  APPROXIMATE: "Aproximada (bairro/cidade) — não é gravada",
};

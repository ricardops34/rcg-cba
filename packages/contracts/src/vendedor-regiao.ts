import { z } from "zod";

/**
 * Regiões de atuação dos vendedores (Gerencial > Vendedores > Regiões,
 * 20/11/2026 — docs/planos/2026-11-20-mapas-clientes-rotas.md).
 *
 * - `area`: polígono desenhado no mapa;
 * - `municipio`: o município inteiro (a divisa vem do IBGE ao salvar).
 *
 * Sem vendedor é **região livre**. **Invasão** é um cliente da carteira de um
 * vendedor que está dentro da região de outro vendedor.
 */
export const VENDEDOR_REGIAO_TIPOS = ["area", "municipio"] as const;
export type VendedorRegiaoTipo = (typeof VENDEDOR_REGIAO_TIPOS)[number];

/** Anel: [longitude, latitude][], fechado ou não (o servidor fecha). */
const anelSchema = z
  .array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]))
  .min(3, "A área precisa de pelo menos 3 pontos")
  .max(5000);

/** GeoJSON Polygon ou MultiPolygon, coordenadas [longitude, latitude]. */
export const geometriaRegiaoSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: z.array(anelSchema).min(1).max(50) }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(z.array(anelSchema).min(1).max(50)).min(1).max(200),
  }),
]);
export type GeometriaRegiao = z.infer<typeof geometriaRegiaoSchema>;

export const vendedorRegiaoCreateSchema = z
  .object({
    nome: z.string().trim().min(1, "Dê um nome à região").max(100),
    /** Nulo = região livre. */
    vendedorId: z.string().uuid().nullable(),
    tipo: z.enum(VENDEDOR_REGIAO_TIPOS),
    municipioId: z.string().uuid().nullish(),
    /** Obrigatória na área desenhada; no município, o servidor busca a divisa. */
    geometria: geometriaRegiaoSchema.nullish(),
  })
  .refine((r) => r.tipo !== "area" || !!r.geometria, {
    message: "Desenhe a área no mapa",
    path: ["geometria"],
  })
  .refine((r) => r.tipo !== "municipio" || !!r.municipioId, {
    message: "Escolha o município",
    path: ["municipioId"],
  });
export type VendedorRegiaoCreate = z.infer<typeof vendedorRegiaoCreateSchema>;

/** Editar: nome, dono e, na área, o desenho. O tipo e o município não mudam. */
export const vendedorRegiaoUpdateSchema = z.object({
  nome: z.string().trim().min(1).max(100).optional(),
  vendedorId: z.string().uuid().nullable().optional(),
  geometria: geometriaRegiaoSchema.optional(),
});
export type VendedorRegiaoUpdate = z.infer<typeof vendedorRegiaoUpdateSchema>;

export type VendedorRegiao = {
  id: string;
  nome: string;
  vendedorId: string | null;
  vendedorNome: string | null;
  tipo: VendedorRegiaoTipo;
  municipioId: string | null;
  municipioNome: string | null;
  uf: string | null;
  /** Nula no município cuja divisa o IBGE não devolveu: aí vale o nome do município. */
  geometria: GeometriaRegiao | null;
};

export const vendedorRegiaoMunicipioQuerySchema = z.object({
  uf: z.string().trim().length(2).optional(),
  busca: z.string().trim().max(60).optional(),
});
export type VendedorRegiaoMunicipioQuery = z.infer<typeof vendedorRegiaoMunicipioQuerySchema>;

export type VendedorRegiaoMunicipioOpcao = { id: string; nome: string; uf: string };

export type VendedorRegiaoInvasao = {
  clienteId: string;
  codigoErp: string | null;
  razaoSocial: string;
  municipio: string | null;
  uf: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Dono da carteira. */
  vendedorId: string;
  vendedorNome: string;
  /** As regiões de outro(s) vendedor(es) em que o cliente está. */
  regioes: Array<{ id: string; nome: string; vendedorId: string; vendedorNome: string }>;
  /** Como caiu na região: pela coordenada ou, sem ela, pelo nome do município. */
  porMunicipio: boolean;
};

export type VendedorRegiaoResumoVendedor = {
  vendedorId: string;
  vendedorNome: string;
  /** Clientes da carteira dele em região de outro. */
  invadindo: number;
  /** Clientes de outros vendedores dentro das regiões dele. */
  invadido: number;
};

export type VendedorRegioesInvasoes = {
  invasoes: VendedorRegiaoInvasao[];
  porVendedor: VendedorRegiaoResumoVendedor[];
  /** Clientes ativos com carteira avaliados (com coordenada ou município). */
  avaliados: number;
};

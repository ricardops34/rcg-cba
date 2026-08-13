import { z } from "zod";

// Dashboard Comercial: objetivo (meta) vs realizado (agregado ao vivo de
// notas_saida_itens), no mesmo espírito de listagemPosicao — sem tabela
// própria de resultado, tudo calculado na consulta.
export const objetivoDashboardQuerySchema = z.object({
  mes: z.coerce.number().int().min(1).max(12),
  ano: z.coerce.number().int().min(2000).max(2100),
  vendedorId: z.string().uuid().optional().describe("Omitido = agrega todo o escopo hierárquico do usuário"),
  // Município do cadastro do cliente. Recorta o que foi vendido e a base de
  // clientes; o objetivo NÃO é afetado — a meta é cadastrada por vendedor/mês
  // e não existe meta por município (a tela avisa isso).
  municipio: z.string().trim().max(60).optional(),
});
export type ObjetivoDashboardQuery = z.infer<typeof objetivoDashboardQuerySchema>;

/**
 * Municípios que têm movimento no período — alimenta o filtro de município do
 * Dashboard Comercial. Só entram os municípios com venda no mês/ano (e no
 * vendedor, quando escolhido): filtrar por um município sem dado devolveria
 * uma tela vazia sem explicação.
 */
export const objetivoDashboardMunicipiosQuerySchema = z.object({
  mes: z.coerce.number().int().min(1).max(12),
  ano: z.coerce.number().int().min(2000).max(2100),
  vendedorId: z.string().uuid().optional(),
});
export type ObjetivoDashboardMunicipiosQuery = z.infer<
  typeof objetivoDashboardMunicipiosQuerySchema
>;

export const objetivoDashboardCategoriaSchema = z.object({
  categoriaId: z.string().uuid(),
  codigoErp: z.string(),
  descricao: z.string(),
  realizado: z.number(),
  objetivo: z.number(),
});
export type ObjetivoDashboardCategoria = z.infer<typeof objetivoDashboardCategoriaSchema>;

export const objetivoDashboardSchema = z.object({
  objetivoValor: z.number().describe("Soma de ObjetivoVendedorMes.valor no período/escopo"),
  realizadoValor: z.number().describe("Soma líquida (vlrTotal − vlrDev) de todos os itens de nota no período/escopo"),
  percRealizado: z.number().describe("realizadoValor / objetivoValor × 100"),
  objetivoClientes: z.number().describe("Soma de ObjetivoVendedorMes.numeroCliente"),
  clientesPositivados: z.number().int().describe("Clientes distintos com venda no período/escopo"),
  percClientes: z.number().describe("clientesPositivados / objetivoClientes × 100"),
  baseTotal: z.number().int().describe("Total de clientes ativos na carteira do escopo (independe do período)"),
  percBase: z.number().describe("clientesPositivados / baseTotal × 100"),
  devolucaoTotal: z.number().describe("Soma de vlrDev dos itens no período/escopo"),
  categorias: z.array(objetivoDashboardCategoriaSchema),
  municipio: z
    .string()
    .nullable()
    .describe("Município filtrado; nulo = todos os do escopo"),
});
export type ObjetivoDashboard = z.infer<typeof objetivoDashboardSchema>;

export const OBJETIVO_DASHBOARD_EXAMPLE: ObjetivoDashboard = {
  objetivoValor: 85600,
  realizadoValor: 99642.34,
  percRealizado: 116.4,
  objetivoClientes: 85,
  clientesPositivados: 84,
  percClientes: 98.82,
  baseTotal: 225,
  percBase: 37.33,
  devolucaoTotal: 0,
  municipio: null,
  categorias: [
    { categoriaId: "9e8d7c6b-5a49-4382-b1c0-d9e8f7a6b5c4", codigoErp: "01", descricao: "LAVAGEM DE TECIDOS", realizado: 8750.95, objetivo: 4500 },
    { categoriaId: "8f7e6d5c-4b3a-4291-a0b9-c8d7e6f5a4b3", codigoErp: "02", descricao: "COZINHA", realizado: 13805.34, objetivo: 11500 },
  ],
};

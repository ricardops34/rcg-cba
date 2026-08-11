import { z } from "zod";

/**
 * Consultas gerenciais de venda (módulo Consultas). As duas têm o mesmo
 * formato de saída — uma linha por entidade (cliente ou produto), com os 12
 * meses do ano e o total — para que tela, PDF e Excel sejam os mesmos em
 * ambas.
 *
 * Base de apuração: nota de saída ATIVA e não-comodato (comodato é remessa,
 * não venda), igual à Posição de Cliente.
 */

export const MESES_LABEL = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

/**
 * Qual vendedor a consulta considera. Vem do parâmetro de empresa
 * `CONSULTA_VENDAS_BASE_VENDEDOR` (Administração > Parâmetros):
 *
 * - `nota`   — quem fez a venda (notas_saida.vendedorId): venda de cobertura
 *              conta para quem vendeu;
 * - `cliente` — o titular do cadastro do cliente (clientes.vendedorId): toda
 *              venda do cliente conta para o dono da carteira.
 */
export const baseVendedorSchema = z.enum(["nota", "cliente"]);
export type BaseVendedor = z.infer<typeof baseVendedorSchema>;

export const PARAMETRO_BASE_VENDEDOR = "CONSULTA_VENDAS_BASE_VENDEDOR";

const anoSchema = z.coerce
  .number()
  .int()
  .min(2000)
  .max(2100)
  .describe("Ano-base das colunas de mês");

export const consultaVendasClienteQuerySchema = z.object({
  ano: anoSchema,
  vendedorId: z.string().uuid().optional(),
});
export type ConsultaVendasClienteQuery = z.infer<
  typeof consultaVendasClienteQuerySchema
>;

export const consultaVendasProdutoQuerySchema = z.object({
  ano: anoSchema,
  vendedorId: z.string().uuid().optional(),
  categoriaId: z.string().uuid().optional(),
});
export type ConsultaVendasProdutoQuery = z.infer<
  typeof consultaVendasProdutoQuerySchema
>;

/** Uma linha do relatório: 12 posições de mês (índice 0 = janeiro) + total. */
export const consultaVendasLinhaSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string().nullable().describe("Código ERP do cliente/produto"),
  descricao: z.string(),
  meses: z.array(z.number()).length(12),
  total: z.number(),
});
export type ConsultaVendasLinha = z.infer<typeof consultaVendasLinhaSchema>;

export const consultaVendasResultadoSchema = z.object({
  ano: z.number().int(),
  baseVendedor: baseVendedorSchema,
  vendedor: z
    .object({ id: z.string().uuid(), nome: z.string() })
    .nullable()
    .describe("Vendedor filtrado; nulo = todos os do escopo do usuário"),
  categoria: z
    .object({ id: z.string().uuid(), descricao: z.string() })
    .nullable()
    .describe("Só na consulta por produto"),
  linhas: z.array(consultaVendasLinhaSchema),
  totaisMes: z.array(z.number()).length(12),
  total: z.number(),
});
export type ConsultaVendasResultado = z.infer<
  typeof consultaVendasResultadoSchema
>;

export const CONSULTA_VENDAS_RESULTADO_EXAMPLE: ConsultaVendasResultado = {
  ano: 2026,
  baseVendedor: "nota",
  vendedor: {
    id: "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c",
    nome: "CAROLINE DA SILVA DE JESUS",
  },
  categoria: null,
  linhas: [
    {
      id: "16e942b5-a1f0-40c7-8534-89c287347f09",
      codigo: "00634201",
      descricao: "MATTER CLINICA E DIAGNOSTICOS LTDA",
      meses: [0, 0, 0, 1200.5, 0, 980, 4963.25, 0, 0, 0, 0, 0],
      total: 7143.75,
    },
  ],
  totaisMes: [0, 0, 0, 1200.5, 0, 980, 4963.25, 0, 0, 0, 0, 0],
  total: 7143.75,
};

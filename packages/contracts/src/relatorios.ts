import { z } from "zod";

/**
 * Módulo de Relatórios (docs/planos/2026-10-13-modulo-relatorios.md). Cada
 * relatório devolve as linhas e os totais; PDF e Excel são montados no
 * navegador a partir do mesmo JSON.
 */

const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .describe("Data civil, AAAA-MM-DD");

const textoOpcional = z.string().trim().min(1).optional();

/** Compras e Vendas paginam; a exportação pede páginas grandes até o teto. */
const paginacaoSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(20000).default(50),
});

export const RELATORIO_TETO_EXPORTACAO = 20000;

// ---------------------------------------------------------------- Compras

export const relatorioComprasQuerySchema = paginacaoSchema.extend({
  inicio: dataSchema.describe("Início do período (data de digitação)"),
  fim: dataSchema.describe("Fim do período (data de digitação)"),
  documento: textoOpcional.describe("Número da nota contém"),
  produto: textoOpcional.describe("Código ou descrição do produto contém"),
  fornecedor: textoOpcional.describe("Código ou razão social do fornecedor/cliente contém"),
});
export type RelatorioComprasQuery = z.infer<typeof relatorioComprasQuerySchema>;

export interface RelatorioComprasLinha {
  id: string;
  documento: string;
  serie: string | null;
  produtoCodigo: string | null;
  descricao: string | null;
  quantidade: number;
  unidade: string | null;
  vlrUnitario: number;
  aliqIpi: number | null;
  vlrTotal: number;
  aliqIcms: number | null;
  codigoForCli: string | null;
  razaoSocial: string | null;
  dtDigitacao: string | null;
}

// ----------------------------------------------------------------- Vendas

export const relatorioVendasQuerySchema = paginacaoSchema.extend({
  inicio: dataSchema.describe("Início do período (emissão)"),
  fim: dataSchema.describe("Fim do período (emissão)"),
  vendedorIds: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined))
    .describe("Vendedores, ids separados por vírgula; vazio = todos"),
  cliente: textoOpcional.describe("Código, razão social ou fantasia do cliente contém"),
  municipio: textoOpcional.describe("Município do cliente contém"),
  notaFiscal: textoOpcional.describe("Número da nota contém"),
  produtoCodigo: textoOpcional.describe("Código do produto contém"),
  produtoNome: textoOpcional.describe("Descrição do produto contém"),
});
export type RelatorioVendasQuery = z.infer<typeof relatorioVendasQuerySchema>;

export interface RelatorioVendasLinha {
  id: string;
  vendedor: string | null;
  clienteCodigo: string | null;
  clienteNome: string | null;
  municipio: string | null;
  emissao: string | null;
  notaFiscal: string;
  produtoCodigo: string | null;
  produto: string | null;
  quantidade: number;
  vlrProduto: number;
  vlrItem: number;
}

// ------------------------------------------------------- Estoque e compra

export const relatorioEstoqueCompraQuerySchema = z.object({
  inicio: dataSchema.describe("Início do período do movimento (entradas e saídas)"),
  fim: dataSchema.describe("Fim do período do movimento"),
  mesesPeriodo: z.coerce
    .number()
    .min(0.5)
    .max(36)
    .optional()
    .describe("Meses do período, quando escolhido por atalho (3, 4, 5, 6); sem ele, pelos dias"),
  mesesCompra: z.coerce
    .number()
    .min(0.5)
    .max(24)
    .default(6)
    .describe("Para quantos meses comprar: a comprar = média × meses − estoque"),
  produto: textoOpcional.describe("Nosso código ou descrição contém"),
  codigoCorp: textoOpcional.describe("Cod. Corp. (B1_XFOR) contém"),
  fornecedor: textoOpcional.describe("Fornecedor da última compra contém"),
  comMovimento: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true")
    .describe("Só produtos com estoque, entrada ou saída no período"),
});
export type RelatorioEstoqueCompraQuery = z.infer<typeof relatorioEstoqueCompraQuerySchema>;

export interface RelatorioEstoqueCompraLinha {
  produtoId: string;
  codigo: string;
  descricao: string;
  codigoCorp: string | null;
  fornecedor: string | null;
  estoque: number;
  entradas: number;
  saidas: number;
  ultimoPreco: number | null;
  media: number;
  aComprar: number;
}

export interface RelatorioResultado<T> {
  linhas: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Somas do filtro inteiro, não só da página. */
  totais: Record<string, number>;
}

export interface RelatorioEstoqueCompraResultado {
  linhas: RelatorioEstoqueCompraLinha[];
  /** Meses do período (dias ÷ 30,44), base da média. */
  mesesPeriodo: number;
  mesesCompra: number;
}

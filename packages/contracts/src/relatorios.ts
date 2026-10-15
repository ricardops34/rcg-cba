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

/** Ids separados por vírgula na query; vazio = todos. */
const ids = (descricao: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined))
    .describe(`${descricao}, ids separados por vírgula; vazio = todos`);

/** Compras e Vendas paginam; a exportação pede páginas grandes até o teto. */
const paginacaoSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(20000).default(50),
  ordem: z
    .string()
    .trim()
    .max(40)
    .optional()
    .describe("Campo da linha para ordenar (ex.: vlrTotal); fora da lista, vale a ordem padrão"),
  sentido: z.enum(["asc", "desc"]).default("asc"),
});

export const RELATORIO_TETO_EXPORTACAO = 20000;

// ---------------------------------------------------------------- Compras

export const relatorioComprasQuerySchema = paginacaoSchema.extend({
  inicio: dataSchema.describe("Início do período (data de digitação)"),
  fim: dataSchema.describe("Fim do período (data de digitação)"),
  documento: textoOpcional.describe("Número da nota contém"),
  categoriaIds: ids("Categorias (ou subcategorias) do produto"),
  produtoIds: ids("Produtos"),
  fornecedorIds: ids("Fornecedores"),
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
  vlrIpi: number;
  vlrTotal: number;
  aliqIcms: number | null;
  vlrIcms: number;
  vlrIcmsSt: number;
  codigoForCli: string | null;
  razaoSocial: string | null;
  dtDigitacao: string | null;
}

// ----------------------------------------------------------------- Vendas

export const relatorioVendasQuerySchema = paginacaoSchema.extend({
  inicio: dataSchema.describe("Início do período (emissão)"),
  fim: dataSchema.describe("Fim do período (emissão)"),
  vendedorIds: ids("Vendedores"),
  clienteIds: ids("Clientes"),
  municipio: textoOpcional.describe("Município do cliente contém"),
  notaFiscal: textoOpcional.describe("Número da nota contém"),
  categoriaIds: ids("Categorias (ou subcategorias) do produto"),
  produtoIds: ids("Produtos"),
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

// ----------------------------------------- Vendas por vendedor (mensal)

/** Parâmetro da empresa que liga/desliga o agrupamento por vendedor na grade. */
export const PARAMETRO_RELATORIO_VENDAS_QUEBRA_VENDEDOR = "RELATORIO_VENDAS_QUEBRA_VENDEDOR";

export const RELATORIO_VENDAS_POR_VENDEDOR_MAX_MESES = 12;

export const relatorioVendasPorVendedorQuerySchema = z
  .object({
    inicio: dataSchema.describe("Início do período (emissão)"),
    fim: dataSchema.describe("Fim do período (emissão)"),
    vendedorIds: ids("Vendedores"),
    clienteIds: ids("Clientes"),
    categoriaIds: ids("Categorias (ou subcategorias) do produto"),
    produtoIds: ids("Produtos"),
    quebraPorVendedor: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true"))
      .describe("Agrupa a grade por vendedor; sem informar, vale o parâmetro da empresa"),
  })
  .refine(
    (q) => {
      const [ai, mi] = q.inicio.split("-").map(Number);
      const [af, mf] = q.fim.split("-").map(Number);
      return (af - ai) * 12 + (mf - mi) >= 0 && (af - ai) * 12 + (mf - mi) < RELATORIO_VENDAS_POR_VENDEDOR_MAX_MESES;
    },
    { message: `O período não pode passar de ${RELATORIO_VENDAS_POR_VENDEDOR_MAX_MESES} meses`, path: ["fim"] },
  );
export type RelatorioVendasPorVendedorQuery = z.infer<typeof relatorioVendasPorVendedorQuerySchema>;

export interface RelatorioVendasPorVendedorMes {
  /** `AAAA-MM` */
  mes: string;
  quantidade: number;
  valor: number;
}

export interface RelatorioVendasPorVendedorLinha {
  vendedorId: string | null;
  vendedor: string | null;
  clienteId: string;
  clienteCodigo: string | null;
  clienteNome: string | null;
  /** Um item por mês do período, na mesma ordem de `resultado.meses`. */
  meses: RelatorioVendasPorVendedorMes[];
  totalQuantidade: number;
  totalValor: number;
}

export interface RelatorioVendasPorVendedorResultado {
  /** `AAAA-MM`, em ordem crescente — as colunas da grade. */
  meses: string[];
  /** Do parâmetro `RELATORIO_VENDAS_QUEBRA_VENDEDOR` da empresa. */
  quebraPorVendedor: boolean;
  linhas: RelatorioVendasPorVendedorLinha[];
  totalQuantidade: number;
  totalValor: number;
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
  produtoIds: ids("Produtos"),
  codigoCorp: textoOpcional.describe("Cod. Corp. (B1_XFOR) contém"),
  categoriaIds: ids("Categorias (ou subcategorias) do produto"),
  fornecedorIds: ids("Fornecedor da última compra"),
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

// ------------------------------------------------- Opções dos filtros

/**
 * Busca das opções dos filtros de produto, fornecedor e cliente. Rota própria
 * do módulo: quem tem um relatório nem sempre tem o cadastro (o Gerente não
 * tem o de fornecedores), e aqui só sai o necessário para escolher.
 */
export const RELATORIO_OPCAO_TIPOS = ["produtos", "fornecedores", "clientes"] as const;
export type RelatorioOpcaoTipo = (typeof RELATORIO_OPCAO_TIPOS)[number];

export const relatorioOpcoesQuerySchema = z.object({
  busca: z
    .string()
    .trim()
    .optional()
    .describe("Código, nome, CNPJ/CPF ou Cod. Corp. (produto); por termos"),
});
export type RelatorioOpcoesQuery = z.infer<typeof relatorioOpcoesQuerySchema>;

/** Teto de opções por busca. */
export const RELATORIO_OPCOES_LIMITE = 100;

export interface RelatorioOpcao {
  id: string;
  codigo: string | null;
  nome: string;
  /** CNPJ, município, Cod. Corp. — o que separa nomes parecidos. */
  detalhe: string | null;
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

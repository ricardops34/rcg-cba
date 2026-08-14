import { z } from "zod";

/**
 * Sugestão de compra: produtos que clientes semelhantes compram e o alvo não.
 *
 * A semelhança tem dois eixos somados, com pesos configuráveis por parâmetro:
 *
 * - **cesta** — Jaccard entre os conjuntos de produtos comprados. Funciona desde
 *   o dia 1, sobre o histórico de notas que já existe.
 * - **CNAE** — ramo de atividade compartilhado (`cliente_cnaes`, carregado da
 *   Receita). Vale zero para cliente sem CNAE, e aí o peso recai na cesta.
 *
 * A evidência volta junto de propósito: sem saber *quais* clientes semelhantes
 * compram o produto e quanto, a lista é indistinguível de palpite, e o vendedor
 * não usa.
 */

export const baseSemelhancaSchema = z.enum(["ambos", "cesta", "cnae"]);
export type BaseSemelhanca = z.infer<typeof baseSemelhancaSchema>;

export const sugestaoCompraQuerySchema = z.object({
  meses: z.coerce
    .number()
    .int()
    .min(1)
    .max(60)
    .default(12)
    .describe("Janela de histórico considerada, em meses"),
  limite: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Quantos produtos sugerir"),
  semelhantes: z.coerce
    .number()
    .int()
    .min(3)
    .max(100)
    .default(30)
    .describe("Quantos clientes semelhantes considerar (top-K)"),
  baseSemelhanca: baseSemelhancaSchema
    .default("ambos")
    .describe("Eixo da semelhança: cesta de compras, CNAE ou os dois"),
});
export type SugestaoCompraQuery = z.infer<typeof sugestaoCompraQuerySchema>;

export const clienteSemelhanteSchema = z.object({
  clienteId: z.string().uuid(),
  razaoSocial: z.string(),
  codigoErp: z.string().nullable(),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
  score: z.number().describe("Semelhança combinada, 0 a 1"),
  indiceCesta: z.number().describe("Jaccard entre as cestas de produtos"),
  cnaesEmComum: z.number().int(),
  mesmoCnaePrincipal: z.boolean(),
  mesmaRegiao: z.boolean(),
  produtosEmComum: z.number().int(),
});
export type ClienteSemelhante = z.infer<typeof clienteSemelhanteSchema>;

export const produtoSugeridoSchema = z.object({
  produtoId: z.string().uuid(),
  codigoErp: z.string(),
  descricao: z.string(),
  score: z.number(),
  semelhantesQueCompram: z.number().int(),
  totalSemelhantes: z.number().int(),
  cobertura: z.number().describe("semelhantesQueCompram / totalSemelhantes"),
  valorMedio: z.number().describe("Ticket médio do produto entre os semelhantes"),
  ultimaCompraNoGrupo: z.string().datetime().nullable(),
  precoTabelaCliente: z
    .number()
    .nullable()
    .describe("Preço vigente na tabela do cliente-alvo, quando resolvível"),
  // Nomes dos semelhantes que compram — é o que o vendedor usa como argumento.
  evidencia: z.array(z.string()),
});
export type ProdutoSugerido = z.infer<typeof produtoSugeridoSchema>;

export const sugestaoCompraResultadoSchema = z.object({
  clienteId: z.string().uuid(),
  razaoSocial: z.string(),
  produtosNaCesta: z.number().int().describe("Tamanho da cesta do cliente-alvo"),
  cnaes: z.array(z.string()).describe("CNAEs do alvo (código — descrição)"),
  clientesSemelhantes: z.array(clienteSemelhanteSchema),
  sugestoes: z.array(produtoSugeridoSchema),
  // Diagnóstico honesto quando não dá para sugerir, em vez de lista vazia sem
  // explicação: cliente sem compras, sem semelhantes, ou já compra tudo.
  aviso: z.string().nullable(),
});
export type SugestaoCompraResultado = z.infer<typeof sugestaoCompraResultadoSchema>;

export const SUGESTAO_COMPRA_EXAMPLE: SugestaoCompraResultado = {
  clienteId: "9c8d7e6f-5a4b-4c3d-2e1f-0a9b8c7d6e5f",
  razaoSocial: "RESTAURANTE DO CENTRO LTDA",
  produtosNaCesta: 42,
  cnaes: ["5611201 — RESTAURANTES E SIMILARES"],
  clientesSemelhantes: [
    {
      clienteId: "1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9",
      razaoSocial: "CANTINA DA PRACA LTDA",
      codigoErp: "004417",
      municipio: "Campo Grande",
      uf: "MS",
      score: 0.62,
      indiceCesta: 0.48,
      cnaesEmComum: 1,
      mesmoCnaePrincipal: true,
      mesmaRegiao: true,
      produtosEmComum: 27,
    },
  ],
  sugestoes: [
    {
      produtoId: "5f6a7b8c-9d0e-4f12-8a3b-4c5d6e7f8091",
      codigoErp: "PROD-118",
      descricao: "OLEO DE SOJA 900ML CX/20",
      score: 0.81,
      semelhantesQueCompram: 24,
      totalSemelhantes: 30,
      cobertura: 0.8,
      valorMedio: 3420.5,
      ultimaCompraNoGrupo: "2026-08-02T00:00:00.000Z",
      precoTabelaCliente: 168.9,
      evidencia: ["CANTINA DA PRACA LTDA", "RESTAURANTE SABOR CASEIRO"],
    },
  ],
  aviso: null,
};

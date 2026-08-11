import { z } from "zod";

/**
 * Consultas gerenciais de venda (módulo Consultas). Todas têm o mesmo formato
 * de saída — uma linha por entidade (cliente, produto ou vendedor), uma
 * coluna por mês do período e o total — para que tela, PDF e Excel sejam os
 * mesmos em todas.
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

/** Teto do período. Acima disso a tabela não cabe na tela sem rolar. */
export const MAX_MESES_CONSULTA = 12;

/**
 * Qual vendedor a consulta credita. O padrão vem do parâmetro de empresa
 * `CONSULTA_VENDAS_BASE_VENDEDOR` (Administração > Parâmetros) e pode ser
 * trocado pontualmente na cortina de parâmetros da consulta:
 *
 * - `nota`   — quem fez a venda (notas_saida.vendedorId): venda de cobertura
 *              conta para quem vendeu;
 * - `cliente` — o titular do cadastro do cliente (clientes.vendedorId): toda
 *              venda do cliente conta para o dono da carteira.
 *
 * Isso é critério de APURAÇÃO. Quem o usuário pode ver é outra coisa, e não
 * muda com esta escolha: a visibilidade é sempre a carteira de clientes que
 * ele alcança (ver escopo hierárquico).
 */
export const baseVendedorSchema = z.enum(["nota", "cliente"]);
export type BaseVendedor = z.infer<typeof baseVendedorSchema>;

export const PARAMETRO_BASE_VENDEDOR = "CONSULTA_VENDAS_BASE_VENDEDOR";

const anoSchema = z.coerce.number().int().min(2000).max(2100);
const mesSchema = z.coerce.number().int().min(1).max(12);

const periodoFields = {
  anoInicial: anoSchema,
  mesInicial: mesSchema,
  anoFinal: anoSchema,
  mesFinal: mesSchema,
};

/** Meses corridos desde o ano 0 — facilita comparar e contar o período. */
export const emMeses = (ano: number, mes: number) => ano * 12 + mes;

/** Quantidade de meses do intervalo, contando as duas pontas. */
export const totalDeMeses = (p: {
  anoInicial: number;
  mesInicial: number;
  anoFinal: number;
  mesFinal: number;
}) =>
  emMeses(p.anoFinal, p.mesFinal) - emMeses(p.anoInicial, p.mesInicial) + 1;

/**
 * Período válido: fim não anterior ao início e no máximo 12 meses. Vale para
 * a API e para a tela — as duas importam esta mesma regra.
 */
export function validarPeriodo(
  p: {
    anoInicial: number;
    mesInicial: number;
    anoFinal: number;
    mesFinal: number;
  },
  ctx: z.RefinementCtx,
) {
  const meses = totalDeMeses(p);
  if (meses < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mesFinal"],
      message: "O fim do período não pode ser anterior ao início",
    });
    return;
  }
  if (meses > MAX_MESES_CONSULTA) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mesFinal"],
      message: `O período não pode passar de ${MAX_MESES_CONSULTA} meses`,
    });
  }
}

export const consultaVendasClienteQuerySchema = z
  .object({
    ...periodoFields,
    vendedorId: z.string().uuid().optional(),
    // Omitido = usa o parâmetro da empresa.
    baseVendedor: baseVendedorSchema.optional(),
  })
  .superRefine(validarPeriodo);
export type ConsultaVendasClienteQuery = z.infer<
  typeof consultaVendasClienteQuerySchema
>;

/** Mesmos filtros da consulta por cliente — muda só o que vai nas linhas. */
export const consultaVendasVendedorQuerySchema =
  consultaVendasClienteQuerySchema;
export type ConsultaVendasVendedorQuery = z.infer<
  typeof consultaVendasVendedorQuerySchema
>;

export const consultaVendasProdutoQuerySchema = z
  .object({
    ...periodoFields,
    vendedorId: z.string().uuid().optional(),
    baseVendedor: baseVendedorSchema.optional(),
    categoriaId: z.string().uuid().optional(),
  })
  .superRefine(validarPeriodo);
export type ConsultaVendasProdutoQuery = z.infer<
  typeof consultaVendasProdutoQuerySchema
>;

/** Uma coluna do relatório: o mês, com o rótulo já pronto ("Jan/26"). */
export const consultaVendasColunaSchema = z.object({
  ano: z.number().int(),
  mes: z.number().int(),
  label: z.string(),
});
export type ConsultaVendasColuna = z.infer<typeof consultaVendasColunaSchema>;

/** Uma linha: `valores` tem o mesmo tamanho e a mesma ordem de `colunas`. */
export const consultaVendasLinhaSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string().nullable().describe("Código ERP do cliente/produto/vendedor"),
  descricao: z.string(),
  valores: z.array(z.number()),
  total: z.number(),
});
export type ConsultaVendasLinha = z.infer<typeof consultaVendasLinhaSchema>;

export const consultaVendasResultadoSchema = z.object({
  periodo: z.object({
    anoInicial: z.number().int(),
    mesInicial: z.number().int(),
    anoFinal: z.number().int(),
    mesFinal: z.number().int(),
    label: z.string().describe('Ex.: "Jan/26 a Jul/26"'),
  }),
  colunas: z.array(consultaVendasColunaSchema),
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
  totais: z.array(z.number()).describe("Total de cada coluna"),
  total: z.number(),
});
export type ConsultaVendasResultado = z.infer<
  typeof consultaVendasResultadoSchema
>;

/** Rótulo curto de uma coluna: "Jan/26". */
export const rotuloMes = (ano: number, mes: number) =>
  `${MESES_LABEL[mes - 1]}/${String(ano).slice(-2)}`;

/** Colunas do período, em ordem cronológica. */
export function colunasDoPeriodo(p: {
  anoInicial: number;
  mesInicial: number;
  anoFinal: number;
  mesFinal: number;
}): ConsultaVendasColuna[] {
  const colunas: ConsultaVendasColuna[] = [];
  let ano = p.anoInicial;
  let mes = p.mesInicial;
  const fim = emMeses(p.anoFinal, p.mesFinal);
  while (emMeses(ano, mes) <= fim) {
    colunas.push({ ano, mes, label: rotuloMes(ano, mes) });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return colunas;
}

export const CONSULTA_VENDAS_RESULTADO_EXAMPLE: ConsultaVendasResultado = {
  periodo: {
    anoInicial: 2026,
    mesInicial: 4,
    anoFinal: 2026,
    mesFinal: 7,
    label: "Abr/26 a Jul/26",
  },
  colunas: [
    { ano: 2026, mes: 4, label: "Abr/26" },
    { ano: 2026, mes: 5, label: "Mai/26" },
    { ano: 2026, mes: 6, label: "Jun/26" },
    { ano: 2026, mes: 7, label: "Jul/26" },
  ],
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
      valores: [1200.5, 0, 980, 4963.25],
      total: 7143.75,
    },
  ],
  totais: [1200.5, 0, 980, 4963.25],
  total: 7143.75,
};

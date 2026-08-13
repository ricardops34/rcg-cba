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

/** Teto de vendedores por consulta — segura o tamanho do IN no SQL. */
export const MAX_VENDEDORES_FILTRO = 50;

/**
 * Filtro de vendedor com seleção múltipla. Chega pela querystring, então
 * aceita as duas formas que um cliente HTTP produz: repetida
 * (`?vendedorIds=a&vendedorIds=b`) e separada por vírgula (`?vendedorIds=a,b`)
 * — esta última é a que o `apiFetch` do web monta.
 *
 * Ausente ou vazio = todos os vendedores do escopo do usuário, que é o padrão
 * da tela ("Todos"). O escopo hierárquico continua valendo por cima disto:
 * pedir um id de fora do time zera o resultado, não o libera.
 */
export const vendedorIdsSchema = z.preprocess(
  (valor) => {
    if (valor === undefined || valor === null || valor === "") return undefined;
    const lista = (Array.isArray(valor) ? valor : [valor])
      .flatMap((v) => String(v).split(","))
      .map((v) => v.trim())
      .filter(Boolean);
    return lista.length > 0 ? lista : undefined;
  },
  z.array(z.string().uuid()).max(MAX_VENDEDORES_FILTRO).optional(),
);

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
    vendedorIds: vendedorIdsSchema,
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
    vendedorIds: vendedorIdsSchema,
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
  media: z
    .number()
    .describe(
      "total ÷ meses COM movimento (valor ≠ 0). Mês zerado não entra no divisor: " +
        "quem comprou 2 vezes em 12 meses tem média do que compra quando compra, " +
        "não do período todo. Sem nenhum mês com movimento, 0.",
    ),
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
  vendedores: z
    .array(z.object({ id: z.string().uuid(), nome: z.string() }))
    .describe("Vendedores filtrados; lista vazia = todos os do escopo"),
  categoria: z
    .object({ id: z.string().uuid(), descricao: z.string() })
    .nullable()
    .describe("Só na consulta por produto"),
  linhas: z.array(consultaVendasLinhaSchema),
  totais: z.array(z.number()).describe("Total de cada coluna"),
  total: z.number(),
  media: z
    .number()
    .describe("Média do rodapé: total ÷ meses com movimento no consolidado"),
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

// ------------------------------------------------------------------
// Evolução mensal (gráfico) — mesmos filtros das consultas acima, com o
// indicador escolhido na tela.
// ------------------------------------------------------------------

/**
 * O que a consulta de evolução mede, mês a mês, por vendedor:
 *
 * - `vendas`      — faturamento (vlrBruto das notas de venda);
 * - `positivados` — clientes distintos que compraram no mês;
 * - `novos`       — clientes cuja PRIMEIRA compra (em todo o histórico, não só
 *                   no período consultado) caiu no mês;
 * - `inativados`  — clientes cuja data de bloqueio caiu no mês.
 */
export const indicadorEvolucaoSchema = z.enum([
  "vendas",
  "positivados",
  "novos",
  "inativados",
]);
export type IndicadorEvolucao = z.infer<typeof indicadorEvolucaoSchema>;

/** Como o número é lido: dinheiro ou contagem de clientes. */
export const formatoEvolucaoSchema = z.enum(["moeda", "quantidade"]);
export type FormatoEvolucao = z.infer<typeof formatoEvolucaoSchema>;

/**
 * Catálogo dos indicadores — a tela monta as abas a partir daqui e o servidor
 * usa o `formato` na resposta, então as duas pontas concordam sobre o que cada
 * número significa.
 */
export const INDICADORES_EVOLUCAO: {
  valor: IndicadorEvolucao;
  label: string;
  /** Explicação curta, mostrada abaixo do título do gráfico. */
  descricao: string;
  formato: FormatoEvolucao;
  /** Se o total do período é a soma dos meses ou uma contagem sem repetição. */
  totalSomaMeses: boolean;
}[] = [
  {
    valor: "vendas",
    label: "Vendas",
    descricao:
      "Faturamento do mês (nota de venda ativa, não-comodato e do tipo Normal).",
    formato: "moeda",
    totalSomaMeses: true,
  },
  {
    valor: "positivados",
    label: "Clientes positivados",
    descricao:
      "Clientes distintos que compraram no mês. O total do período soma os meses — quem comprou em três meses conta três vezes.",
    formato: "quantidade",
    totalSomaMeses: true,
  },
  {
    valor: "novos",
    label: "Clientes novos",
    descricao:
      "Clientes cuja primeira compra de todo o histórico caiu no mês. Cada cliente aparece uma única vez.",
    formato: "quantidade",
    totalSomaMeses: false,
  },
  {
    valor: "inativados",
    label: "Clientes inativados",
    descricao:
      "Clientes cuja data de bloqueio caiu no mês, creditados ao vendedor do cadastro. Cada cliente aparece uma única vez.",
    formato: "quantidade",
    totalSomaMeses: false,
  },
];

export const consultaEvolucaoQuerySchema = z
  .object({
    ...periodoFields,
    vendedorIds: vendedorIdsSchema,
    // Omitido = usa o parâmetro da empresa. Ignorado em `inativados`, que não
    // parte de nota nenhuma: lá o crédito é sempre do vendedor do cadastro.
    baseVendedor: baseVendedorSchema.optional(),
    indicador: indicadorEvolucaoSchema.default("vendas"),
  })
  .superRefine(validarPeriodo);
export type ConsultaEvolucaoQuery = z.infer<typeof consultaEvolucaoQuerySchema>;

/**
 * Mesma estrutura pivô das outras consultas (uma linha por vendedor, uma
 * coluna por mês) — o gráfico lê cada linha como uma série e cada coluna como
 * um ponto no tempo.
 */
export const consultaEvolucaoResultadoSchema =
  consultaVendasResultadoSchema.extend({
    indicador: indicadorEvolucaoSchema,
    formato: formatoEvolucaoSchema,
  });
export type ConsultaEvolucaoResultado = z.infer<
  typeof consultaEvolucaoResultadoSchema
>;

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
  vendedores: [
    {
      id: "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c",
      nome: "CAROLINE DA SILVA DE JESUS",
    },
  ],
  categoria: null,
  linhas: [
    {
      id: "16e942b5-a1f0-40c7-8534-89c287347f09",
      codigo: "00634201",
      descricao: "MATTER CLINICA E DIAGNOSTICOS LTDA",
      valores: [1200.5, 0, 980, 4963.25],
      total: 7143.75,
      // 3 meses com movimento (Mai/26 ficou zerado), não 4.
      media: 2381.25,
    },
  ],
  totais: [1200.5, 0, 980, 4963.25],
  total: 7143.75,
  media: 2381.25,
};

export const CONSULTA_EVOLUCAO_RESULTADO_EXAMPLE: ConsultaEvolucaoResultado = {
  ...CONSULTA_VENDAS_RESULTADO_EXAMPLE,
  linhas: [
    {
      id: "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c",
      codigo: "000012",
      descricao: "CAROLINE DA SILVA DE JESUS",
      valores: [1200.5, 0, 980, 4963.25],
      total: 7143.75,
      media: 2381.25,
    },
  ],
  indicador: "vendas",
  formato: "moeda",
};

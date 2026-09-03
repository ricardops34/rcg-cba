import { z } from "zod";

/**
 * Dashboard Gerencial: acompanhamento do mês por vendedor — objetivo, o que
 * foi realizado, positivação e os indicadores de topo.
 *
 * Difere do Dashboard Comercial (objetivo-dashboard.ts) em dois pontos: abre
 * uma linha por vendedor em vez de por categoria, e traz os indicadores de
 * carteira (base, clientes sem vendedor, ticket médio).
 *
 * Base de apuração: itens de nota ativa, com o líquido `vlrTotal - vlrDev`, a
 * mesma do Dashboard Comercial.
 */

export const dashboardGerencialQuerySchema = z.object({
  mes: z.coerce.number().int().min(1).max(12),
  ano: z.coerce.number().int().min(2000).max(2100),
  vendedorId: z
    .string()
    .uuid()
    .optional()
    .describe("Omitido = todo o escopo hierárquico do usuário"),
});
export type DashboardGerencialQuery = z.infer<
  typeof dashboardGerencialQuerySchema
>;

/**
 * Uma linha da tabela: um vendedor no mês consultado. O mês/ano não vêm por
 * linha — são os mesmos de `periodo`, que a tela já exibe no cabeçalho.
 */
export const dashboardGerencialLinhaSchema = z.object({
  vendedorId: z.string().uuid(),
  nome: z.string(),
  /**
   * O lugar do vendedor na hierarquia comercial. Vem em toda linha, mesmo
   * com o agrupamento desligado: é barato, e é o que permite a tela montar a
   * árvore sem uma segunda consulta.
   */
  tipo: z.enum(["vendedor", "superior"]),
  superiorId: z.string().uuid().nullable(),
  positivacaoObjetivo: z
    .number()
    .int()
    .describe("Meta de clientes do mês (soma de numeroCliente dos objetivos)"),
  positivacaoRealizado: z
    .number()
    .int()
    .describe("Clientes distintos que compraram deste vendedor no período"),
  percPositivacao: z
    .number()
    .describe("positivacaoRealizado / positivacaoObjetivo × 100; 0 sem meta"),
  objetivo: z.number(),
  realizado: z.number(),
  percRealizado: z.number().describe("realizado / objetivo × 100; 0 sem objetivo"),
});
export type DashboardGerencialLinha = z.infer<
  typeof dashboardGerencialLinhaSchema
>;

export const dashboardGerencialSchema = z.object({
  periodo: z.object({
    mes: z.number().int(),
    ano: z.number().int(),
    label: z.string().describe('Ex.: "08/2026"'),
  }),
  resumo: z.object({
    realizado: z.number().describe("Líquido (vlrTotal − vlrDev) no período"),
    objetivo: z.number().describe("Soma dos objetivos do mês no escopo"),
    percRealizado: z.number(),
    clientesPositivados: z
      .number()
      .int()
      .describe("Clientes distintos com compra no período"),
    objetivoClientes: z.number().int().describe("Soma de numeroCliente dos objetivos"),
    percClientes: z.number(),
    devolucao: z.number().describe("Soma de vlrDev no período"),
    baseTotal: z.number().int().describe("Clientes ativos da carteira do escopo"),
    percBase: z.number().describe("clientesPositivados / baseTotal × 100"),
    clientesSemVendedor: z
      .number()
      .int()
      .describe(
        "Clientes ativos sem vendedor ativo: sem vendedor no cadastro ou apontando " +
          "para vendedor inativo/excluído (visível a quem alcança toda a base)",
      ),
    totalNotas: z.number().int().describe("Notas de venda emitidas no período"),
    ticketMedio: z.number().describe("realizado / totalNotas"),
  }),
  linhas: z.array(dashboardGerencialLinhaSchema),
  /**
   * Supervisores e gerentes citados pelas linhas — só id, nome e papel.
   *
   * Eles **não** têm linha própria: a venda é sempre do vendedor que atende o
   * cliente, e supervisor e gerente aparecem nesta tela como o agrupador do
   * time. Mas o grupo precisa de nome, e sem esta lista a tela só teria o id
   * do responsável para mostrar.
   */
  responsaveis: z.array(
    z.object({
      id: z.string().uuid(),
      nome: z.string(),
      tipo: z.literal("superior"),
    }),
  ),
  /**
   * Se a tela deve agrupar as linhas pela hierarquia (parâmetro da empresa
   * `DASHBOARD_GERENCIAL_HIERARQUIA`).
   *
   * A decisão vem do servidor, e não do navegador, porque é configuração da
   * empresa — e porque a tela não tem como saber sozinha se a hierarquia está
   * cadastrada a ponto de o agrupamento fazer sentido.
   */
  agruparPorHierarquia: z.boolean(),
});
export type DashboardGerencial = z.infer<typeof dashboardGerencialSchema>;

export const DASHBOARD_GERENCIAL_EXAMPLE: DashboardGerencial = {
  periodo: { mes: 8, ano: 2026, label: "08/2026" },
  resumo: {
    realizado: 185942.21,
    objetivo: 574600,
    percRealizado: 32.36,
    clientesPositivados: 133,
    objetivoClientes: 395,
    percClientes: 33.67,
    devolucao: 0,
    baseTotal: 1039,
    percBase: 12.8,
    clientesSemVendedor: 97,
    totalNotas: 68,
    ticketMedio: 2734.44,
  },
  linhas: [
    {
      vendedorId: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
      nome: "CARLOS",
      tipo: "vendedor",
      superiorId: null,
      positivacaoObjetivo: 95,
      positivacaoRealizado: 33,
      percPositivacao: 34.74,
      objetivo: 135600,
      realizado: 50075.06,
      percRealizado: 36.93,
    },
  ],
  responsaveis: [
    { id: "c8d9e0f1-2a3b-4c5d-8e9f-0a1b2c3d4e5f", nome: "REGINA", tipo: "superior" },
  ],
  agruparPorHierarquia: true,
};

/**
 * Detalhe de um vendedor do Dashboard Gerencial, aberto ao clicar na linha:
 * o mesmo mês repartido por categoria de produto.
 *
 * A meta por categoria vem das linhas de `ObjetivoVendedorMesCategoria`; o
 * realizado é o líquido dos itens de nota agrupados pela categoria do produto.
 * Categoria só com meta (nada vendido) e categoria só com venda (sem meta)
 * entram as duas — as duas dizem algo sobre o mês.
 */
export const dashboardGerencialVendedorQuerySchema = z.object({
  mes: z.coerce.number().int().min(1).max(12),
  ano: z.coerce.number().int().min(2000).max(2100),
});
export type DashboardGerencialVendedorQuery = z.infer<
  typeof dashboardGerencialVendedorQuerySchema
>;

export const dashboardGerencialCategoriaSchema = z.object({
  categoriaId: z.string().uuid(),
  codigoErp: z.string(),
  descricao: z.string(),
  objetivo: z.number(),
  realizado: z.number(),
  percRealizado: z.number(),
});
export type DashboardGerencialCategoria = z.infer<
  typeof dashboardGerencialCategoriaSchema
>;

export const dashboardGerencialVendedorSchema = z.object({
  vendedorId: z.string().uuid(),
  nome: z.string(),
  periodo: z.object({
    mes: z.number().int(),
    ano: z.number().int(),
    label: z.string(),
  }),
  /**
   * Totais do vendedor no mês. Não são a soma das categorias: o objetivo do
   * mês é cadastrado no cabeçalho (e pode não estar todo repartido em
   * categorias), e item sem produto/categoria entra no realizado do mês sem
   * cair em nenhuma linha.
   */
  objetivo: z.number(),
  realizado: z.number(),
  percRealizado: z.number(),
  categorias: z.array(dashboardGerencialCategoriaSchema),
  /** Realizado que não caiu em categoria nenhuma (item sem produto vinculado). */
  realizadoSemCategoria: z.number(),
});
export type DashboardGerencialVendedor = z.infer<
  typeof dashboardGerencialVendedorSchema
>;

/**
 * Clientes que ninguém está atendendo — o detalhe do card "Clientes sem
 * vendedor ativo": cliente ativo sem vendedor no cadastro ou apontando para
 * vendedor inativo/excluído.
 *
 * `ultimaCompra` é a mais recente entre o campo do cadastro (que o import do
 * legado preenche e cobre o histórico antigo) e a última nota de venda na
 * base. Nenhuma das duas sozinha responde "há quanto tempo esse cliente não
 * compra": há cliente com compra antiga sem nota importada, e nota nova em
 * cliente cujo cadastro não foi reimportado.
 */
export const dashboardGerencialClienteSemVendedorSchema = z.object({
  clienteId: z.string().uuid(),
  codigo: z.string().nullable().describe("codigoErp do cliente"),
  nome: z.string().describe("Razão social"),
  cnpjCpf: z.string().nullable(),
  ultimaCompra: z
    .string()
    .nullable()
    .describe("ISO 8601; nulo = sem compra registrada"),
});
export type DashboardGerencialClienteSemVendedor = z.infer<
  typeof dashboardGerencialClienteSemVendedorSchema
>;

export const dashboardGerencialClientesSemVendedorSchema = z.object({
  total: z.number().int().describe("Total no critério, mesmo além do limite"),
  limite: z.number().int().describe("Máximo de linhas devolvidas nesta resposta"),
  linhas: z.array(dashboardGerencialClienteSemVendedorSchema),
});
export type DashboardGerencialClientesSemVendedor = z.infer<
  typeof dashboardGerencialClientesSemVendedorSchema
>;

export const DASHBOARD_GERENCIAL_CLIENTES_SEM_VENDEDOR_EXAMPLE: DashboardGerencialClientesSemVendedor =
  {
    total: 111,
    limite: 1000,
    linhas: [
      {
        clienteId: "c1a2b3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
        codigo: "004321",
        nome: "MERCADO CENTRAL LTDA",
        cnpjCpf: "12345678000190",
        ultimaCompra: "2026-07-28T00:00:00.000Z",
      },
    ],
  };

export const DASHBOARD_GERENCIAL_VENDEDOR_EXAMPLE: DashboardGerencialVendedor = {
  vendedorId: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
  nome: "CARLOS",
  periodo: { mes: 8, ano: 2026, label: "08/2026" },
  objetivo: 135600,
  realizado: 50075.06,
  percRealizado: 36.93,
  realizadoSemCategoria: 0,
  categorias: [
    {
      categoriaId: "9e8d7c6b-5a49-4382-b1c0-d9e8f7a6b5c4",
      codigoErp: "01",
      descricao: "LAVAGEM DE TECIDOS",
      objetivo: 45000,
      realizado: 18750.95,
      percRealizado: 41.67,
    },
  ],
};

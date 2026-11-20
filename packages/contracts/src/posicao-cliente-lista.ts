import { z } from "zod";
import { booleanQueryParam, paginationQuerySchema } from "./common";

// Linha da listagem de Posição de Cliente (não confundir com a Posição de
// Cliente detalhada em posicao-cliente.ts). Colunas de venda são calculadas
// ao vivo, agregando notas_saida por cliente:
// - vendaUltimos30Dias: soma de vlrBruto das notas emitidas nos últimos 30 dias
// - vendaMedia90Dias: soma de vlrBruto dos últimos 90 dias, dividida por 3 (média mensal)
// - difMesEMedia: vendaUltimos30Dias − vendaMedia90Dias
export const posicaoClienteListRowSchema = z.object({
  id: z.string().uuid(),
  codigoErp: z.string().nullable(),
  razaoSocial: z.string(),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
  ativo: z.boolean(),
  vendedorNome: z
    .string()
    .nullable()
    .describe("Vendedor responsável pela carteira; null sem vínculo"),
  ultimaCompra: z.string().datetime().nullable(),
  dias: z.number().int().nullable().describe("Dias desde a última compra; null se o cliente nunca comprou"),
  vendaUltimos30Dias: z.number(),
  vendaMedia90Dias: z.number().describe("Total vendido nos últimos 90 dias ÷ 3 (média mensal)"),
  difMesEMedia: z.number().describe("vendaUltimos30Dias − vendaMedia90Dias"),
  comodato: z
    .boolean()
    .describe("Existe nota de saída ativa marcada como comodato para este cliente"),
  comodatoSemConsumo: z
    .boolean()
    .describe(
      "Está com equipamento de comodato que tem produtos aplicáveis e não comprou nenhum deles nos últimos 30 dias (ver docs/planos/equipamentos-comodato.md)",
    ),
  comodatoBaixado: z.boolean().describe("Tem baixa de comodato vigente"),
  bloqueado: z
    .boolean()
    .describe("dataBloqueio preenchida sem reativação posterior (dataReativacao)"),
  temTituloVencido: z
    .boolean()
    .describe("Tem título a receber em aberto (sem baixa) com vencimento no passado"),
  temTituloVencendo: z
    .boolean()
    .describe("Tem título a receber em aberto (sem baixa) vencendo nos próximos 7 dias"),
  temTituloNaoVencido: z
    .boolean()
    .describe("Tem título a receber em aberto (sem baixa) vencendo em mais de 7 dias, ou sem vencimento"),
});
export type PosicaoClienteListRow = z.infer<typeof posicaoClienteListRowSchema>;

export const posicaoClienteListQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  uf: z.string().trim().length(2).optional(),
  municipio: z.string().trim().optional(),
  vendedorId: z.string().uuid().optional(),
  carteira: booleanQueryParam,
  diasSemComprar: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe("Filtro rápido: só clientes cuja última compra foi há N+ dias (ou nunca compraram)"),
  produtoId: z
    .string()
    .uuid()
    .optional()
    .describe("Só clientes que já compraram este produto em nota de venda"),
  bloqueado: booleanQueryParam,
  temTituloVencido: booleanQueryParam,
  comodatoSemConsumo: booleanQueryParam,
  comodatoBaixado: booleanQueryParam,
  /** Está com algum equipamento em comodato (saldo > 0), cadastrado ou não. */
  comodatoEmPoder: booleanQueryParam,
  tipoPessoa: z.enum(["fisica", "juridica"]).optional().describe("Pessoa física ou jurídica"),
  /**
   * Ramo de atividade, por **prefixo** do código CNAE — o mesmo filtro da
   * listagem de Clientes. Vale o principal e os secundários: basta um bater.
   */
  cnae: z
    .string()
    .trim()
    .regex(/^\d{2,7}$/, "Informe de 2 a 7 dígitos do código CNAE")
    .optional()
    .describe("Prefixo do código CNAE (2 a 7 dígitos), principal ou secundário"),
});
export type PosicaoClienteListQuery = z.infer<typeof posicaoClienteListQuerySchema>;

export const POSICAO_CLIENTE_LIST_ROW_EXAMPLE: PosicaoClienteListRow = {
  id: "d4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70",
  codigoErp: "004417",
  razaoSocial: "MERCADO ANDRADE LTDA",
  municipio: "CAMPO GRANDE",
  uf: "MS",
  ativo: true,
  vendedorNome: "MARCOS ANTONIO",
  ultimaCompra: "2026-07-28T00:00:00.000Z",
  dias: 0,
  vendaUltimos30Dias: 838.0,
  vendaMedia90Dias: 564.67,
  difMesEMedia: 273.33,
  comodato: true,
  comodatoSemConsumo: false,
  comodatoBaixado: false,
  bloqueado: false,
  temTituloVencido: false,
  temTituloVencendo: false,
  temTituloNaoVencido: true,
};

/**
 * Mapa da Posição de Cliente: os mesmos filtros da listagem, sem página nem
 * ordem — o mapa mostra todos os clientes filtrados que têm coordenadas.
 */
export const posicaoClienteMapaQuerySchema = posicaoClienteListQuerySchema
  .omit({
    page: true,
    pageSize: true,
    sortBy: true,
    sortOrder: true,
  })
  .extend({
    /** Só os N clientes que mais compraram no período (telas de Mapa, 20/11/2026). */
    topN: z.coerce.number().int().min(1).max(500).optional(),
    /** Período do faturamento do pin e do Top N, em meses (padrão 12). */
    periodoMeses: z.coerce.number().int().min(1).max(36).optional(),
  });
export type PosicaoClienteMapaQuery = z.infer<typeof posicaoClienteMapaQuerySchema>;

/**
 * Situação que define a cor do pin. Vale a pior: bloqueado > título vencido >
 * título em aberto (a vencer) > ativo; inativo à parte.
 */
export const situacaoPinClienteSchema = z.enum([
  "bloqueado",
  "titulo_vencido",
  "titulo_aberto",
  "ativo",
  "inativo",
]);
export type SituacaoPinCliente = z.infer<typeof situacaoPinClienteSchema>;

export const SITUACAO_PIN_CLIENTE_ROTULO: Record<SituacaoPinCliente, string> = {
  bloqueado: "Bloqueado",
  titulo_vencido: "Título vencido",
  titulo_aberto: "Título em aberto (a vencer)",
  ativo: "Ativo",
  inativo: "Inativo",
};

export type PosicaoClienteMapaPin = {
  id: string;
  codigoErp: string | null;
  razaoSocial: string;
  nomeFantasia: string | null;
  municipio: string | null;
  uf: string | null;
  latitude: number;
  longitude: number;
  ultimaCompra: string | null;
  situacao: SituacaoPinCliente;
  // Para o "Colorir por" e o balão do mapa (20/11/2026).
  ativo: boolean;
  bloqueado: boolean;
  tipoPessoa: "fisica" | "juridica";
  vendedorId: string | null;
  vendedorNome: string | null;
  /** Total das notas de venda no período (`periodoMeses`, padrão 12 meses). */
  vendaPeriodo: number;
  /** CNAE principal do cliente, quando cadastrado. */
  cnaeCodigo: string | null;
  cnaeDescricao: string | null;
};

/** Cliente filtrado que não tem coordenada (vazia ou 0/0): a lista do mapa. */
export type PosicaoClienteMapaSemCoordenada = {
  id: string;
  codigoErp: string | null;
  razaoSocial: string;
  endereco: string | null;
  municipio: string | null;
  uf: string | null;
};

/**
 * Lead aberto (novo ou em atendimento) no mapa, com pin próprio. Só vem para
 * quem tem leads.visualizar.
 */
export type PosicaoClienteMapaLead = {
  id: string;
  nome: string | null;
  empresaInformada: string | null;
  telefone: string;
  interesse: string;
  temperatura: "quente" | "morno" | "frio";
  situacao: "novo" | "em_atendimento";
  vendedorNome: string | null;
  municipio: string | null;
  uf: string | null;
  latitude: number;
  longitude: number;
};

export type PosicaoClienteMapa = {
  pins: PosicaoClienteMapaPin[];
  /**
   * Leads abertos com coordenadas, da mesma carteira: vendedor (e UF/município)
   * do filtro da tela. Os demais filtros são de cliente e não se aplicam.
   */
  leads: PosicaoClienteMapaLead[];
  /** Clientes filtrados, com ou sem coordenadas. */
  totalFiltrados: number;
  /** Mais pins que o limite: o mapa mostra só os primeiros. */
  limitado: boolean;
  /** Os filtrados sem coordenada (até 500), para posicionar. */
  semCoordenadas: PosicaoClienteMapaSemCoordenada[];
};

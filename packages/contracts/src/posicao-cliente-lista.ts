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
  ultimaCompra: z.string().datetime().nullable(),
  dias: z.number().int().nullable().describe("Dias desde a última compra; null se o cliente nunca comprou"),
  vendaUltimos30Dias: z.number(),
  vendaMedia90Dias: z.number().describe("Total vendido nos últimos 90 dias ÷ 3 (média mensal)"),
  difMesEMedia: z.number().describe("vendaUltimos30Dias − vendaMedia90Dias"),
  comodato: z
    .boolean()
    .describe("Existe nota de saída ativa marcada como comodato para este cliente"),
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
  bloqueado: booleanQueryParam,
});
export type PosicaoClienteListQuery = z.infer<typeof posicaoClienteListQuerySchema>;

export const POSICAO_CLIENTE_LIST_ROW_EXAMPLE: PosicaoClienteListRow = {
  id: "d4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70",
  codigoErp: "004417",
  razaoSocial: "MERCADO ANDRADE LTDA",
  municipio: "CAMPO GRANDE",
  uf: "MS",
  ativo: true,
  ultimaCompra: "2026-07-28T00:00:00.000Z",
  dias: 0,
  vendaUltimos30Dias: 838.0,
  vendaMedia90Dias: 564.67,
  difMesEMedia: 273.33,
  comodato: true,
  bloqueado: false,
  temTituloVencido: false,
  temTituloVencendo: false,
  temTituloNaoVencido: true,
};

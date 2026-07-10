import { z } from "zod";
import { auditFieldsSchema } from "./common";

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const tituloReceberCreateSchema = z.object({
  clienteId: z.string().uuid().nullable().default(null),
  colaboradorId: z
    .string()
    .uuid()
    .nullable()
    .default(null)
    .describe("Vendedor responsável (para a visão por hierarquia)"),
  numero: z.string().trim().min(1, "Informe o número do título").max(9),
  parcela: opt(3),
  prefixo: opt(3),
  tipo: opt(3).describe("Tipo do título no ERP (NF, BOL, NCC...)"),
  emissao: z.coerce.date(),
  vencimento: z.coerce.date(),
  valor: z.coerce.number().min(0).default(0),
  saldo: z.coerce
    .number()
    .min(0)
    .default(0)
    .describe("Saldo em aberto; 0 = liquidado"),
  dtBaixa: z.coerce.date().nullable().optional().describe("Data da baixa (liquidação), se houver"),
  historico: opt(500),
  ativo: z.boolean().default(true),
});
export type TituloReceberCreate = z.infer<typeof tituloReceberCreateSchema>;

export const tituloReceberUpdateSchema = tituloReceberCreateSchema.partial();
export type TituloReceberUpdate = z.infer<typeof tituloReceberUpdateSchema>;

export const tituloReceberSchema = tituloReceberCreateSchema.extend({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type TituloReceber = z.infer<typeof tituloReceberSchema>;

export const TITULO_RECEBER_CREATE_EXAMPLE: TituloReceberCreate = {
  clienteId: null,
  colaboradorId: null,
  numero: "123456",
  parcela: "A",
  prefixo: "1",
  tipo: "NF",
  emissao: new Date("2026-07-01"),
  vencimento: new Date("2026-07-31"),
  valor: 1250.5,
  saldo: 1250.5,
  dtBaixa: null,
  historico: "",
  ativo: true,
};

// -----------------------------------------------------------------------------
// Posição do cliente (indicadores consolidados + históricos em abas)
// -----------------------------------------------------------------------------

export const posicaoClienteSchema = z.object({
  cliente: z.object({
    id: z.string().uuid(),
    codigoErp: z.string().nullable(),
    razaoSocial: z.string(),
    nomeFantasia: z.string().nullable(),
    cnpjCpf: z.string().nullable(),
    municipio: z.string().nullable(),
    uf: z.string().nullable(),
    telefone: z.string().nullable(),
    email: z.string().nullable(),
    ativo: z.boolean(),
    vendedorNome: z.string().nullable(),
  }),
  indicadores: z.object({
    primeiraCompra: z.string().datetime().nullable(),
    ultimaCompra: z.string().datetime().nullable(),
    diasSemCompra: z.number().int().nullable(),
    qtdNotas: z.number().int(),
    faturamento12m: z.number().describe("Soma de vlrItens das notas (não comodato) dos últimos 12 meses"),
    ticketMedio: z.number().describe("Faturamento total / nº de notas de venda"),
    saldoAberto: z.number().describe("Soma do saldo dos títulos em aberto"),
    valorVencido: z.number().describe("Parcela do saldo em aberto já vencida"),
    titulosAbertos: z.number().int(),
    maiorAtraso: z.number().int().describe("Dias de atraso do título vencido mais antigo em aberto"),
    comodatoAtivo: z.number().describe("Soma de vlrItens das notas de comodato"),
    qtdComodatos: z.number().int(),
  }),
});
export type PosicaoCliente = z.infer<typeof posicaoClienteSchema>;

import { z } from "zod";
import { auditFieldsSchema } from "./common";

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const notaSaidaItemCreateSchema = z.object({
  descricao: z.string().trim().min(1, "Informe a descrição do item").max(200),
  quantidade: z.coerce.number().positive("Quantidade deve ser maior que zero").default(1),
  vlrUnitario: z.coerce.number().min(0).default(0),
  vlrDesconto: z.coerce.number().min(0).default(0),
});
export type NotaSaidaItemCreate = z.infer<typeof notaSaidaItemCreateSchema>;

export const notaSaidaItemSchema = notaSaidaItemCreateSchema.extend({
  id: z.string().uuid(),
  notaSaidaId: z.string().uuid(),
  item: z.number().int(),
  vlrTotal: z.number().describe("quantidade * vlrUnitario - vlrDesconto, calculado pela API"),
});
export type NotaSaidaItem = z.infer<typeof notaSaidaItemSchema>;

export const notaSaidaCreateSchema = z.object({
  clienteId: z.string().uuid().nullable().default(null),
  colaboradorId: z
    .string()
    .uuid()
    .nullable()
    .default(null)
    .describe("Vendedor responsável pela venda"),
  numero: z.string().trim().min(1, "Informe o número da nota fiscal").max(9),
  serie: opt(3),
  especieFiscal: opt(10),
  dtEmissao: z.coerce.date().describe("Data de emissão da nota fiscal"),
  vlrIcms: z.coerce.number().min(0).default(0),
  vlrIpi: z.coerce.number().min(0).default(0),
  vlrFrete: z.coerce.number().min(0).default(0),
  vlrDesconto: z.coerce.number().min(0).default(0).describe("Desconto geral da nota (fora do desconto por item)"),
  chaveNfe: opt(60),
  observacao: opt(500),
  comodato: z
    .boolean()
    .default(false)
    .describe("Nota de remessa em comodato (não conta como faturamento de venda)"),
  ativo: z.boolean().default(true),
  itens: z.array(notaSaidaItemCreateSchema).min(1, "Inclua ao menos um item"),
});
export type NotaSaidaCreate = z.infer<typeof notaSaidaCreateSchema>;

export const notaSaidaUpdateSchema = notaSaidaCreateSchema.partial({
  clienteId: true,
  colaboradorId: true,
  numero: true,
  serie: true,
  especieFiscal: true,
  dtEmissao: true,
  vlrIcms: true,
  vlrIpi: true,
  vlrFrete: true,
  vlrDesconto: true,
  chaveNfe: true,
  observacao: true,
  comodato: true,
  ativo: true,
  itens: true,
});
export type NotaSaidaUpdate = z.infer<typeof notaSaidaUpdateSchema>;

export const notaSaidaSchema = notaSaidaCreateSchema.extend({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  ano: z.number().int(),
  mes: z.number().int(),
  vlrMercadoria: z.number().describe("Soma dos itens antes de desconto/impostos"),
  vlrItens: z
    .number()
    .describe(
      "Valor faturado da nota (soma dos itens líquida de desconto) — fonte de dados para valorRealizado em MetaVendedor",
    ),
  itens: z.array(notaSaidaItemSchema),
  ...auditFieldsSchema.shape,
});
export type NotaSaida = z.infer<typeof notaSaidaSchema>;

export const NOTA_SAIDA_CREATE_EXAMPLE: NotaSaidaCreate = {
  clienteId: null,
  colaboradorId: null,
  numero: "123456",
  serie: "1",
  especieFiscal: "NF-e",
  dtEmissao: new Date("2026-07-10"),
  vlrIcms: 120,
  vlrIpi: 0,
  vlrFrete: 50,
  vlrDesconto: 0,
  chaveNfe: "",
  observacao: "",
  comodato: false,
  ativo: true,
  itens: [
    { descricao: "Produto A", quantidade: 10, vlrUnitario: 25, vlrDesconto: 0 },
  ],
};

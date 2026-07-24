import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const condicaoPagamentoCreateSchema = z.object({
  codigoErp: z.string().trim().min(1, "Informe o código ERP").max(10),
  descricao: z.string().trim().min(1, "Informe a descrição").max(100),
  forma: opt(3),
  ativo: z.boolean().default(true),
});
export type CondicaoPagamentoCreate = z.infer<typeof condicaoPagamentoCreateSchema>;

export const condicaoPagamentoUpdateSchema = condicaoPagamentoCreateSchema.partial();
export type CondicaoPagamentoUpdate = z.infer<typeof condicaoPagamentoUpdateSchema>;

export const condicaoPagamentoSchema = condicaoPagamentoCreateSchema.extend({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type CondicaoPagamento = z.infer<typeof condicaoPagamentoSchema>;

export const condicaoPagamentoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  forma: z.string().trim().max(3).optional(),
});
export type CondicaoPagamentoQuery = z.infer<typeof condicaoPagamentoQuerySchema>;

export const CONDICAO_PAGAMENTO_EXAMPLE: CondicaoPagamento = {
  id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  codigoErp: "001",
  descricao: "BOLETO 28 DIAS",
  forma: "BOL",
  ativo: true,
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const CONDICAO_PAGAMENTO_CREATE_EXAMPLE: CondicaoPagamentoCreate = {
  codigoErp: "001",
  descricao: "BOLETO 28 DIAS",
  forma: "BOL",
  ativo: true,
};

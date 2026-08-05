import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

// aberto: sem baixa e ainda não vencido; vencido: sem baixa e vencimento no
// passado; baixado: com data de baixa. Calculado no backend a cada consulta
// (não é uma coluna própria).
export const tituloReceberStatusSchema = z.enum(["aberto", "vencido", "baixado"]);
export type TituloReceberStatus = z.infer<typeof tituloReceberStatusSchema>;

// Espelho read-only do ERP: sem create/update — os dados entram só pelo
// import (e no futuro pela API externa de manutenção).
export const tituloReceberSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  codigoLegado: z.number().int().nullable(),
  clienteId: z.string().uuid().nullable(),
  vendedorId: z.string().uuid().nullable(),
  numero: z.string(),
  parcela: z.string().nullable(),
  prefixo: z.string().nullable(),
  tipo: z.string().nullable(),
  emissao: z.string().datetime().nullable(),
  vencimento: z.string().datetime().nullable(),
  vencimentoReal: z.string().datetime().nullable(),
  valor: z.number(),
  saldo: z.number(),
  acrescimo: z.number().nullable(),
  decrescimo: z.number().nullable(),
  dtBaixa: z.string().datetime().nullable(),
  status: tituloReceberStatusSchema,
  formaPgto: z.string().nullable(),
  historico: z.string().nullable(),
  ativo: z.boolean(),
  ...auditFieldsSchema.shape,
});
export type TituloReceber = z.infer<typeof tituloReceberSchema>;

export const tituloReceberQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  clienteId: z.string().uuid().optional(),
  vendedorId: z.string().uuid().optional(),
  status: tituloReceberStatusSchema.optional(),
});
export type TituloReceberQuery = z.infer<typeof tituloReceberQuerySchema>;

export const TITULO_RECEBER_EXAMPLE: TituloReceber = {
  id: "1e2f3a4b-5c6d-4e7f-8091-a2b3c4d5e6f7",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  codigoLegado: 88214,
  clienteId: "d4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70",
  vendedorId: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
  numero: "000116067",
  parcela: "A",
  prefixo: "NF",
  tipo: "NF",
  emissao: "2026-06-30T00:00:00.000Z",
  vencimento: "2026-07-28T00:00:00.000Z",
  vencimentoReal: "2026-07-28T00:00:00.000Z",
  valor: 1260.5,
  saldo: 1260.5,
  acrescimo: null,
  decrescimo: null,
  dtBaixa: null,
  status: "vencido",
  formaPgto: "B",
  historico: null,
  ativo: true,
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

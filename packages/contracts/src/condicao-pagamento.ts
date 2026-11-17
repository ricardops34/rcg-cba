import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

// Condições de pagamento entram pelo import (e no futuro pela API externa de
// manutenção). A exceção é `usadoOrcamento`, marcação da plataforma que se
// edita por aqui — ver `condicaoPagamentoUpdateSchema`.
export const condicaoPagamentoSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  codigoErp: z.string(),
  chave: z.string().nullable().optional(),
  descricao: z.string(),
  forma: z.string().nullable(),
  ativo: z.boolean(),
  /** Aparece para escolha no orçamento. */
  usadoOrcamento: z.boolean(),
  ...auditFieldsSchema.shape,
});
export type CondicaoPagamento = z.infer<typeof condicaoPagamentoSchema>;

export const condicaoPagamentoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  forma: z.string().trim().max(3).optional(),
  usadoOrcamento: booleanQueryParam,
});
export type CondicaoPagamentoQuery = z.infer<typeof condicaoPagamentoQuerySchema>;

/**
 * Marcação da plataforma (17/11/2026): `usadoOrcamento` escolhe as condições
 * que o vendedor pode escolher no orçamento. A condição do cadastro do cliente
 * continua sendo sugerida mesmo desmarcada.
 */
export const condicaoPagamentoUpdateSchema = z.object({
  usadoOrcamento: z.boolean(),
});
export type CondicaoPagamentoUpdate = z.infer<typeof condicaoPagamentoUpdateSchema>;

export const CONDICAO_PAGAMENTO_EXAMPLE: CondicaoPagamento = {
  id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  codigoErp: "001",
  descricao: "BOLETO 28 DIAS",
  forma: "BOL",
  ativo: true,
  usadoOrcamento: true,
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

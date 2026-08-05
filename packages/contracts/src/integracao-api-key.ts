import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

export const integracaoApiKeyCreateSchema = z.object({
  nome: z.string().trim().min(1, "Informe um nome").max(100).describe("Ex.: \"ERP Protheus - produção\""),
  expiraEm: z.coerce.date().nullable().optional().describe("Data de expiração — nulo = não expira"),
});
export type IntegracaoApiKeyCreate = z.infer<typeof integracaoApiKeyCreateSchema>;

export const integracaoApiKeyUpdateSchema = z.object({
  nome: z.string().trim().min(1).max(100).optional(),
  ativo: z.boolean().optional().describe("false revoga a chave imediatamente"),
  expiraEm: z.coerce.date().nullable().optional(),
});
export type IntegracaoApiKeyUpdate = z.infer<typeof integracaoApiKeyUpdateSchema>;

// Leitura: nunca expõe a chave em claro nem o hash — só o prefixo, pra
// identificar a chave em tela/log.
export const integracaoApiKeySchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  nome: z.string(),
  prefixo: z.string(),
  ativo: z.boolean(),
  expiraEm: z.string().datetime().nullable(),
  ultimoUso: z.string().datetime().nullable(),
  ...auditFieldsSchema.shape,
});
export type IntegracaoApiKey = z.infer<typeof integracaoApiKeySchema>;

// Resposta do POST — única vez em que a chave em claro aparece.
export const integracaoApiKeyCriadaSchema = integracaoApiKeySchema.extend({
  chave: z.string().describe("Chave em claro (header x-api-key) — não fica recuperável depois desta resposta"),
});
export type IntegracaoApiKeyCriada = z.infer<typeof integracaoApiKeyCriadaSchema>;

export const integracaoApiKeyQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type IntegracaoApiKeyQuery = z.infer<typeof integracaoApiKeyQuerySchema>;

export const INTEGRACAO_API_KEY_EXAMPLE: IntegracaoApiKey = {
  id: "3a4b5c6d-7e8f-4091-a2b3-c4d5e6f70819",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  nome: "ERP Protheus - produção",
  prefixo: "itg_a1b2c3d4",
  ativo: true,
  expiraEm: null,
  ultimoUso: "2026-08-04T10:00:00.000Z",
  createdAt: "2026-08-04T09:00:00.000Z",
  updatedAt: "2026-08-04T09:00:00.000Z",
  createdBy: "b4ae8111-4fe7-4f4a-a8b2-b12bf2a63650",
  updatedBy: "b4ae8111-4fe7-4f4a-a8b2-b12bf2a63650",
};

export const INTEGRACAO_API_KEY_CRIADA_EXAMPLE: IntegracaoApiKeyCriada = {
  ...INTEGRACAO_API_KEY_EXAMPLE,
  ultimoUso: null,
  chave: "itg_a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6",
};

export const INTEGRACAO_API_KEY_CREATE_EXAMPLE: IntegracaoApiKeyCreate = {
  nome: "ERP Protheus - produção",
  expiraEm: null,
};

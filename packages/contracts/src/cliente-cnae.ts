import { z } from "zod";
import { auditFieldsSchema } from "./common";

/**
 * CNAEs de um cliente (principal + secundárias), apontando para a referência
 * `cnaes` — populada pelo sync do IBGE (`prisma/sync-ibge.ts`).
 *
 * Três origens alimentam a mesma estrutura: a tela de cliente (escolhendo na
 * referência), a consulta pública de CNPJ (MinhaReceita) e a API de integração
 * do ERP. Por isso há dois jeitos de apontar o CNAE — por `cnaeId`, que a tela
 * já tem em mãos, e por `cnaeCodigo`, que é o que as fontes externas conhecem.
 *
 * É o eixo de afinidade da sugestão de compra: clientes do mesmo ramo tendem a
 * comprar o mesmo conjunto de produtos.
 */

export const clienteCnaeCreateSchema = z.object({
  cnaeId: z.string().uuid().describe("CNAE da tabela de referência"),
  principal: z
    .boolean()
    .default(false)
    .describe("CNAE fiscal principal do cliente; os demais são secundários"),
});
export type ClienteCnaeCreate = z.infer<typeof clienteCnaeCreateSchema>;

/** Variante por código (7 dígitos), usada pelas fontes externas. */
export const clienteCnaePorCodigoSchema = z.object({
  cnaeCodigo: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 7, "O código CNAE deve ter 7 dígitos")
    .describe("Código da subclasse CNAE, só dígitos (ex.: 4639701)"),
  principal: z.boolean().default(false),
});
export type ClienteCnaePorCodigo = z.infer<typeof clienteCnaePorCodigoSchema>;

export const clienteCnaeSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  clienteId: z.string().uuid(),
  cnaeId: z.string().uuid(),
  principal: z.boolean(),
  // Desnormalizado na leitura: a tela mostra código e descrição sem precisar
  // de uma segunda consulta à referência.
  codigo: z.string().nullable().describe("Código da subclasse (7 dígitos)"),
  descricao: z.string().describe("Descrição do CNAE na referência do IBGE"),
  ...auditFieldsSchema.shape,
});
export type ClienteCnae = z.infer<typeof clienteCnaeSchema>;

export const CLIENTE_CNAE_CREATE_EXAMPLE: ClienteCnaeCreate = {
  cnaeId: "7a8b9c0d-1e2f-4a3b-4c5d-6e7f8091a2b3",
  principal: true,
};

export const CLIENTE_CNAE_EXAMPLE: ClienteCnae = {
  id: "1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7081",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  clienteId: "9c8d7e6f-5a4b-4c3d-2e1f-0a9b8c7d6e5f",
  cnaeId: "7a8b9c0d-1e2f-4a3b-4c5d-6e7f8091a2b3",
  principal: true,
  codigo: "4639701",
  descricao: "COMÉRCIO ATACADISTA DE PRODUTOS ALIMENTÍCIOS EM GERAL",
  createdAt: "2026-08-14T12:00:00.000Z",
  updatedAt: "2026-08-14T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

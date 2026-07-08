import { z } from "zod";
import { auditFieldsSchema } from "./common";

export const empresaCreateSchema = z.object({
  razaoSocial: z
    .string()
    .trim()
    .min(2)
    .max(150)
    .describe("Razão social da empresa, conforme registrada na Receita Federal"),
  nomeFantasia: z
    .string()
    .trim()
    .min(2)
    .max(150)
    .describe("Nome fantasia usado na interface do sistema"),
  cnpj: z
    .string()
    .trim()
    .regex(/^\d{14}$/, "CNPJ deve conter 14 dígitos numéricos")
    .describe("CNPJ somente números, 14 dígitos, sem máscara"),
  ativo: z
    .boolean()
    .default(true)
    .describe("Empresas inativas não permitem novos logins de usuários vinculados"),
});
export type EmpresaCreate = z.infer<typeof empresaCreateSchema>;

export const empresaUpdateSchema = empresaCreateSchema.partial();
export type EmpresaUpdate = z.infer<typeof empresaUpdateSchema>;

export const empresaSchema = empresaCreateSchema.extend({
  id: z.string().uuid().describe("Identificador único da empresa (UUID v4)"),
  ...auditFieldsSchema.shape,
});
export type Empresa = z.infer<typeof empresaSchema>;

export const EMPRESA_CREATE_EXAMPLE: EmpresaCreate = {
  razaoSocial: "Comercial Andrade Ltda",
  nomeFantasia: "Andrade Distribuidora",
  cnpj: "12345678000199",
  ativo: true,
};

export const EMPRESA_EXAMPLE: Empresa = {
  ...EMPRESA_CREATE_EXAMPLE,
  id: "2113ce67-5cf9-40e6-b1ed-fa88281c2a92",
  createdAt: "2026-07-08T00:47:25.545Z",
  updatedAt: "2026-07-08T00:47:25.545Z",
  createdBy: null,
  updatedBy: null,
};

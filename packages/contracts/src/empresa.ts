import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

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
  alias: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Alias deve conter apenas letras minúsculas, números e hífen")
    .nullable()
    .optional()
    .describe("Identificador curto usado na URL de login (?empresa=<alias>) e no branding"),
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .describe("Caminho relativo do logo da empresa (definido via upload)"),
  ativo: z
    .boolean()
    .default(true)
    .describe("Empresas inativas não permitem novos logins de usuários vinculados"),
});
export type EmpresaCreate = z.infer<typeof empresaCreateSchema>;

export const empresaBrandingSchema = z.object({
  alias: z.string().describe("Alias da empresa"),
  nomeFantasia: z.string().describe("Nome fantasia exibido na tela de login"),
  logoUrl: z.string().nullable().describe("Caminho relativo do logo, ou null se não houver"),
});
export type EmpresaBranding = z.infer<typeof empresaBrandingSchema>;

export const empresaUpdateSchema = empresaCreateSchema.partial();
export type EmpresaUpdate = z.infer<typeof empresaUpdateSchema>;

export const empresaSchema = empresaCreateSchema.extend({
  id: z.string().uuid().describe("Identificador único da empresa (UUID v4)"),
  ...auditFieldsSchema.shape,
});
export type Empresa = z.infer<typeof empresaSchema>;

export const empresaQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type EmpresaQuery = z.infer<typeof empresaQuerySchema>;

export const EMPRESA_CREATE_EXAMPLE: EmpresaCreate = {
  razaoSocial: "Comercial Andrade Ltda",
  nomeFantasia: "Andrade Distribuidora",
  cnpj: "12345678000199",
  alias: "andrade",
  logoUrl: null,
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

export const EMPRESA_BRANDING_EXAMPLE: EmpresaBranding = {
  alias: "andrade",
  nomeFantasia: "Andrade Distribuidora",
  logoUrl: "/uploads/logos/andrade.png",
};

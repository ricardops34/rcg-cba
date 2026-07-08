import { z } from "zod";
import { auditFieldsSchema } from "./common";

export const empresaCreateSchema = z.object({
  razaoSocial: z.string().trim().min(2).max(150),
  nomeFantasia: z.string().trim().min(2).max(150),
  cnpj: z
    .string()
    .trim()
    .regex(/^\d{14}$/, "CNPJ deve conter 14 dígitos numéricos"),
  ativo: z.boolean().default(true),
});
export type EmpresaCreate = z.infer<typeof empresaCreateSchema>;

export const empresaUpdateSchema = empresaCreateSchema.partial();
export type EmpresaUpdate = z.infer<typeof empresaUpdateSchema>;

export const empresaSchema = empresaCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type Empresa = z.infer<typeof empresaSchema>;

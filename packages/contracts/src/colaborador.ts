import { z } from "zod";
import { auditFieldsSchema } from "./common";

export const cargoSchema = z.enum(["diretor", "gerente", "supervisor", "vendedor"]);
export type Cargo = z.infer<typeof cargoSchema>;

export const colaboradorCreateSchema = z.object({
  usuarioId: z.string().uuid(),
  superiorId: z.string().uuid().nullable().default(null),
  cargo: cargoSchema,
  matricula: z.string().trim().max(40).optional(),
  ativo: z.boolean().default(true),
});
export type ColaboradorCreate = z.infer<typeof colaboradorCreateSchema>;

export const colaboradorUpdateSchema = colaboradorCreateSchema
  .omit({ usuarioId: true })
  .partial();
export type ColaboradorUpdate = z.infer<typeof colaboradorUpdateSchema>;

export const colaboradorSchema = colaboradorCreateSchema.extend({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type Colaborador = z.infer<typeof colaboradorSchema>;

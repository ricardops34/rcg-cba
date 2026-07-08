import { z } from "zod";
import { acaoSchema, auditFieldsSchema } from "./common";

export const perfilCreateSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  descricao: z.string().trim().max(255).optional(),
  ativo: z.boolean().default(true),
});
export type PerfilCreate = z.infer<typeof perfilCreateSchema>;

export const perfilUpdateSchema = perfilCreateSchema.partial();
export type PerfilUpdate = z.infer<typeof perfilUpdateSchema>;

export const perfilSchema = perfilCreateSchema.extend({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  sistemaBase: z.boolean(),
  ...auditFieldsSchema.shape,
});
export type Perfil = z.infer<typeof perfilSchema>;

export const perfilPermissaoItemSchema = z.object({
  rotinaId: z.string().uuid(),
  acao: acaoSchema,
  permitido: z.boolean(),
});
export type PerfilPermissaoItem = z.infer<typeof perfilPermissaoItemSchema>;

export const perfilPermissoesUpdateSchema = z.object({
  permissoes: z.array(perfilPermissaoItemSchema),
});
export type PerfilPermissoesUpdate = z.infer<
  typeof perfilPermissoesUpdateSchema
>;

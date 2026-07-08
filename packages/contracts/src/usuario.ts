import { z } from "zod";
import { auditFieldsSchema } from "./common";

export const usuarioCreateSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  senha: z
    .string()
    .min(8, "Mínimo de 8 caracteres")
    .regex(/[A-Z]/, "Deve conter ao menos uma letra maiúscula")
    .regex(/[0-9]/, "Deve conter ao menos um número"),
  ativo: z.boolean().default(true),
  perfilId: z.string().uuid("Selecione um perfil para o usuário na empresa"),
});
export type UsuarioCreate = z.infer<typeof usuarioCreateSchema>;

export const usuarioUpdateSchema = usuarioCreateSchema
  .omit({ senha: true, perfilId: true })
  .partial();
export type UsuarioUpdate = z.infer<typeof usuarioUpdateSchema>;

export const usuarioSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  email: z.string().email(),
  ativo: z.boolean(),
  ultimoLogin: z.string().datetime().nullable(),
  avatarUrl: z.string().url().nullable(),
  ...auditFieldsSchema.shape,
});
export type Usuario = z.infer<typeof usuarioSchema>;

export const usuarioEmpresaCreateSchema = z.object({
  usuarioId: z.string().uuid(),
  empresaId: z.string().uuid(),
  perfilId: z.string().uuid(),
  ativo: z.boolean().default(true),
});
export type UsuarioEmpresaCreate = z.infer<typeof usuarioEmpresaCreateSchema>;

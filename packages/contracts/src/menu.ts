import { z } from "zod";
import { auditFieldsSchema } from "./common";

export const moduloCreateSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  icone: z.string().trim().max(60).optional(),
  ordem: z.coerce.number().int().min(0).default(0),
  ativo: z.boolean().default(true),
});
export type ModuloCreate = z.infer<typeof moduloCreateSchema>;
export const moduloUpdateSchema = moduloCreateSchema.partial();
export type ModuloUpdate = z.infer<typeof moduloUpdateSchema>;
export const moduloSchema = moduloCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type Modulo = z.infer<typeof moduloSchema>;

export const menuCreateSchema = z.object({
  moduloId: z.string().uuid(),
  menuPaiId: z.string().uuid().nullable().default(null),
  nome: z.string().trim().min(2).max(80),
  icone: z.string().trim().max(60).optional(),
  rota: z.string().trim().max(150).optional(),
  ordem: z.coerce.number().int().min(0).default(0),
  ativo: z.boolean().default(true),
});
export type MenuCreate = z.infer<typeof menuCreateSchema>;
export const menuUpdateSchema = menuCreateSchema.partial();
export type MenuUpdate = z.infer<typeof menuUpdateSchema>;
export const menuSchema = menuCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type Menu = z.infer<typeof menuSchema>;

export const rotinaCreateSchema = z.object({
  menuId: z.string().uuid(),
  nome: z.string().trim().min(2).max(80),
  codigo: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9._-]+$/, "Use apenas minúsculas, números, ponto, hífen ou underline"),
  ativo: z.boolean().default(true),
});
export type RotinaCreate = z.infer<typeof rotinaCreateSchema>;
export const rotinaUpdateSchema = rotinaCreateSchema.partial();
export type RotinaUpdate = z.infer<typeof rotinaUpdateSchema>;
export const rotinaSchema = rotinaCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type Rotina = z.infer<typeof rotinaSchema>;

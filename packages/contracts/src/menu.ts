import { z } from "zod";
import { auditFieldsSchema } from "./common";

export const moduloCreateSchema = z.object({
  nome: z.string().trim().min(2).max(80).describe("Nome do módulo exibido no menu lateral"),
  icone: z
    .string()
    .trim()
    .max(60)
    .optional()
    .describe("Nome do ícone (lucide-react) exibido junto ao módulo"),
  ordem: z.coerce.number().int().min(0).default(0).describe("Posição de exibição no menu (crescente)"),
  ativo: z.boolean().default(true).describe("Módulos inativos ficam ocultos do menu"),
});
export type ModuloCreate = z.infer<typeof moduloCreateSchema>;
export const moduloUpdateSchema = moduloCreateSchema.partial();
export type ModuloUpdate = z.infer<typeof moduloUpdateSchema>;
export const moduloSchema = moduloCreateSchema.extend({
  id: z.string().uuid().describe("Identificador único do módulo (UUID v4)"),
  ...auditFieldsSchema.shape,
});
export type Modulo = z.infer<typeof moduloSchema>;

export const menuCreateSchema = z.object({
  moduloId: z.string().uuid().describe("Módulo ao qual este menu pertence"),
  menuPaiId: z
    .string()
    .uuid()
    .nullable()
    .default(null)
    .describe("Menu pai, para criar submenus; null para menu de primeiro nível"),
  nome: z.string().trim().min(2).max(80).describe("Nome do item de menu"),
  icone: z.string().trim().max(60).optional().describe("Nome do ícone (lucide-react)"),
  rota: z
    .string()
    .trim()
    .max(150)
    .optional()
    .describe("Rota do front-end associada a este menu, ex.: /admin/empresas"),
  ordem: z.coerce.number().int().min(0).default(0).describe("Posição de exibição dentro do módulo"),
  ativo: z.boolean().default(true).describe("Menus inativos ficam ocultos"),
});
export type MenuCreate = z.infer<typeof menuCreateSchema>;
export const menuUpdateSchema = menuCreateSchema.partial();
export type MenuUpdate = z.infer<typeof menuUpdateSchema>;
export const menuSchema = menuCreateSchema.extend({
  id: z.string().uuid().describe("Identificador único do menu (UUID v4)"),
  ...auditFieldsSchema.shape,
});
export type Menu = z.infer<typeof menuSchema>;

export const rotinaCreateSchema = z.object({
  menuId: z.string().uuid().describe("Menu ao qual esta rotina pertence"),
  nome: z.string().trim().min(2).max(80).describe("Nome amigável da rotina"),
  codigo: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9._-]+$/, "Use apenas minúsculas, números, ponto, hífen ou underline")
    .describe(
      "Código único usado nas permissões e no decorator @RequirePermission (ex.: 'empresas', 'clientes')",
    ),
  ativo: z.boolean().default(true).describe("Rotinas inativas não podem receber permissões"),
});
export type RotinaCreate = z.infer<typeof rotinaCreateSchema>;
export const rotinaUpdateSchema = rotinaCreateSchema.partial();
export type RotinaUpdate = z.infer<typeof rotinaUpdateSchema>;
export const rotinaSchema = rotinaCreateSchema.extend({
  id: z.string().uuid().describe("Identificador único da rotina (UUID v4)"),
  ...auditFieldsSchema.shape,
});
export type Rotina = z.infer<typeof rotinaSchema>;

export const MODULO_CREATE_EXAMPLE: ModuloCreate = {
  nome: "Comercial",
  icone: "briefcase",
  ordem: 2,
  ativo: true,
};

export const MENU_CREATE_EXAMPLE: MenuCreate = {
  moduloId: "seed-modulo-administracao",
  menuPaiId: null,
  nome: "Clientes",
  icone: "contact",
  rota: "/comercial/clientes",
  ordem: 1,
  ativo: true,
};

export const ROTINA_CREATE_EXAMPLE: RotinaCreate = {
  menuId: "seed-menu-clientes",
  nome: "Clientes",
  codigo: "clientes",
  ativo: true,
};

import { z } from "zod";
import { acaoSchema, auditFieldsSchema } from "./common";

export const perfilCreateSchema = z.object({
  nome: z.string().trim().min(2).max(80).describe("Nome do perfil (ex.: Administrador, Gerente)"),
  descricao: z
    .string()
    .trim()
    .max(255)
    .optional()
    .describe("Descrição livre do que este perfil representa"),
  ativo: z.boolean().default(true).describe("Perfis inativos não podem ser atribuídos a novos usuários"),
});
export type PerfilCreate = z.infer<typeof perfilCreateSchema>;

export const perfilUpdateSchema = perfilCreateSchema.partial();
export type PerfilUpdate = z.infer<typeof perfilUpdateSchema>;

export const perfilSchema = perfilCreateSchema.extend({
  id: z.string().uuid().describe("Identificador único do perfil (UUID v4)"),
  empresaId: z.string().uuid().describe("Empresa dona do perfil"),
  sistemaBase: z
    .boolean()
    .describe("Perfis base do sistema têm acesso total e não podem ser excluídos"),
  ...auditFieldsSchema.shape,
});
export type Perfil = z.infer<typeof perfilSchema>;

export const perfilPermissaoItemSchema = z.object({
  rotinaId: z.string().uuid().describe("Rotina (funcionalidade) sendo permissionada"),
  acao: acaoSchema.describe("Operação dentro da rotina"),
  permitido: z.boolean().describe("true libera a ação, false bloqueia"),
});
export type PerfilPermissaoItem = z.infer<typeof perfilPermissaoItemSchema>;

export const perfilPermissoesUpdateSchema = z.object({
  permissoes: z
    .array(perfilPermissaoItemSchema)
    .describe("Lista completa de permissões a aplicar (upsert por rotina+ação)"),
});
export type PerfilPermissoesUpdate = z.infer<
  typeof perfilPermissoesUpdateSchema
>;

export const PERFIL_CREATE_EXAMPLE: PerfilCreate = {
  nome: "Gerente",
  descricao: "Acesso aos cadastros comerciais",
  ativo: true,
};

export const PERFIL_PERMISSOES_UPDATE_EXAMPLE: PerfilPermissoesUpdate = {
  permissoes: [
    {
      rotinaId: "seed-rotina-produtos",
      acao: "visualizar",
      permitido: true,
    },
    {
      rotinaId: "seed-rotina-produtos",
      acao: "editar",
      permitido: false,
    },
  ],
};

import { z } from "zod";
import { acaoSchema, auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

export const perfilCreateSchema = z.object({
  nome: z.string().trim().min(2).max(80).describe("Nome do perfil (ex.: Administrador Empresa, Gerente)"),
  descricao: z
    .string()
    .trim()
    .max(255)
    .optional()
    .describe("Descrição livre do que este perfil representa"),
  ativo: z.boolean().default(true).describe("Perfis inativos não podem ser atribuídos a novos usuários"),
  rotinaInicialId: z
    .string()
    .nullable()
    .optional()
    .describe("ID da rotina inicial padrão para este perfil"),
});
export type PerfilCreate = z.infer<typeof perfilCreateSchema>;

export const perfilUpdateSchema = perfilCreateSchema.partial();
export type PerfilUpdate = z.infer<typeof perfilUpdateSchema>;

// administraPlataforma fica de fora de perfilCreateSchema/perfilUpdateSchema
// de propósito: só o seed e a migration concedem esse acesso. Deixar de fora
// do que a API aceita ao criar/editar fecha, de um só lugar, o caminho de um
// admin de empresa se auto-promover a admin da plataforma pela tela de
// Perfis (que já é protegida por PlatformAdminGuard, mas é defesa em
// profundidade — ver UsuariosService.garantirPodeAtribuirPerfil para a trava
// que de fato importa: atribuir esse perfil a um vínculo).
export const perfilSchema = perfilCreateSchema.extend({
  id: z.string().uuid().describe("Identificador único do perfil (UUID v4)"),
  sistemaBase: z
    .boolean()
    .describe("Perfis base do sistema têm acesso total e não podem ser excluídos"),
  administraPlataforma: z
    .boolean()
    .describe("Perfil de administração da plataforma (todas as empresas) — não concedível pela API"),
  rotinaInicialNome: z.string().nullable().optional().describe("Nome da rotina inicial vinculada"),
  rotinaInicialRota: z.string().nullable().optional().describe("Rota da rotina inicial vinculada (ex.: /comercial/dashboard)"),
  ...auditFieldsSchema.shape,
});
export type Perfil = z.infer<typeof perfilSchema>;

export const perfilPermissaoItemSchema = z.object({
  rotinaId: z.string().min(1).describe("Rotina (funcionalidade) sendo permissionada"),
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

export const perfilQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  sistemaBase: booleanQueryParam,
});
export type PerfilQuery = z.infer<typeof perfilQuerySchema>;

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

import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

export const usuarioCreateSchema = z.object({
  nome: z.string().trim().min(2).max(120).describe("Nome completo do usuário"),
  email: z
    .string()
    .trim()
    .email()
    .toLowerCase()
    .describe("E-mail de login, único no sistema"),
  // A força real da senha é validada dinamicamente pelo backend
  // (PoliticaSenhaService.validarSenha) contra os parâmetros vigentes em
  // PoliticaSenha — este schema só garante que o campo não chegue vazio.
  senha: z
    .string()
    .min(1, "Informe a senha")
    .max(128)
    .describe("Senha inicial do usuário — validada contra a política de senha vigente"),
  ativo: z.boolean().default(true).describe("Usuários inativos não conseguem autenticar"),
  perfilId: z
    .string()
    .uuid("Selecione um perfil para o usuário na empresa")
    .describe("Perfil (RBAC) atribuído ao usuário na empresa ativa"),
});
export type UsuarioCreate = z.infer<typeof usuarioCreateSchema>;

export const usuarioUpdateSchema = usuarioCreateSchema
  .omit({ senha: true, perfilId: true })
  .partial();
export type UsuarioUpdate = z.infer<typeof usuarioUpdateSchema>;

// Corpo de PATCH /usuarios/:id/senha — reset de senha por admin, sem exigir
// a senha atual (complementa a troca self-service de POST /auth/change-password).
export const resetPasswordSchema = z
  .object({
    novaSenha: z.string().min(1, "Informe a nova senha"),
    confirmarNovaSenha: z.string().min(1, "Confirme a nova senha"),
    deveTrocarSenha: z
      .boolean()
      .default(true)
      .describe("Se true, o usuário é obrigado a trocar a senha no próximo login"),
  })
  .refine((v) => v.novaSenha === v.confirmarNovaSenha, {
    message: "As senhas não conferem",
    path: ["confirmarNovaSenha"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const usuarioSchema = z.object({
  id: z.string().uuid().describe("Identificador único do usuário (UUID v4)"),
  nome: z.string().describe("Nome completo do usuário"),
  email: z.string().email().describe("E-mail de login"),
  ativo: z.boolean().describe("Indica se o usuário pode autenticar"),
  ultimoLogin: z
    .string()
    .datetime()
    .nullable()
    .describe("Data/hora do último login bem-sucedido, ou null se nunca logou"),
  avatarUrl: z.string().url().nullable().describe("URL da foto de perfil, se configurada"),
  ...auditFieldsSchema.shape,
});
export type Usuario = z.infer<typeof usuarioSchema>;

// Corpo de POST /usuarios/:id/empresas/:empresaId — cria o vínculo (ou edita
// um existente, mesma rota) com o perfil (RBAC) + hierarquia/dados de
// vendedor completos.
export const usuarioEmpresaCreateSchema = z.object({
  perfilId: z.string().uuid().describe("Perfil (RBAC) do usuário nesta empresa"),
  superiorId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe("Vínculo (usuário×empresa) superior na hierarquia; null se for o topo"),
  codigoErp: z
    .string()
    .trim()
    .max(40)
    .optional()
    .describe("Código do vendedor no ERP de origem (ex.: Protheus), usado para conciliar vendas importadas"),
  nomeReduzido: z
    .string()
    .trim()
    .max(60)
    .optional()
    .describe("Nome curto/apelido usado em listagens e relatórios (ex.: 'CARLOS' em vez do nome completo)"),
  telefone: z.string().trim().max(20).optional().or(z.literal("")),
  celular: z.string().trim().max(20).optional().or(z.literal("")),
  dataNascimento: z.coerce.date().nullable().optional(),
  ativo: z.boolean().default(true).describe("Vínculo ativo permite login nesta empresa"),
});
export type UsuarioEmpresaCreate = z.infer<typeof usuarioEmpresaCreateSchema>;

export const usuarioQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  perfilId: z.string().uuid().optional(),
});
export type UsuarioQuery = z.infer<typeof usuarioQuerySchema>;

export const USUARIO_CREATE_EXAMPLE: UsuarioCreate = {
  nome: "Maria Souza",
  email: "maria.souza@empresademo.com",
  senha: "Senha@123",
  ativo: true,
  perfilId: "06b281c4-c6d6-454c-82c6-75106224bbfc",
};

export const USUARIO_EXAMPLE: Usuario = {
  id: "827167a9-93f9-4fd8-9cc5-dcd8077c600d",
  nome: "Maria Souza",
  email: "maria.souza@empresademo.com",
  ativo: true,
  ultimoLogin: "2026-07-08T12:30:00.000Z",
  avatarUrl: null,
  createdAt: "2026-07-08T00:47:25.545Z",
  updatedAt: "2026-07-08T00:47:25.545Z",
  createdBy: null,
  updatedBy: null,
};

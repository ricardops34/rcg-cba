import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email().describe("E-mail cadastrado do usuário"),
  senha: z.string().min(1, "Informe a senha").describe("Senha em texto plano (validada via bcrypt no servidor)"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const authTokensSchema = z.object({
  accessToken: z
    .string()
    .describe("JWT de curta duração (15 min) enviado no header Authorization: Bearer"),
  refreshToken: z
    .string()
    .describe("Token opaco de longa duração (7 dias), rotativo a cada uso, usado só em /auth/refresh"),
  expiresIn: z.number().int().describe("Validade do accessToken em segundos"),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const refreshInputSchema = z.object({
  refreshToken: z.string().describe("Refresh token obtido no login ou no refresh anterior"),
});
export type RefreshInput = z.infer<typeof refreshInputSchema>;

export const switchEmpresaInputSchema = z.object({
  empresaId: z
    .string()
    .uuid()
    .describe("Empresa para a qual a sessão deve trocar (o usuário precisa ter vínculo ativo com ela)"),
});
export type SwitchEmpresaInput = z.infer<typeof switchEmpresaInputSchema>;

export const currentUserSchema = z.object({
  id: z.string().uuid().describe("Identificador do usuário autenticado"),
  nome: z.string().describe("Nome completo do usuário"),
  email: z.string().email().describe("E-mail do usuário"),
  empresaAtivaId: z.string().uuid().describe("Empresa atualmente ativa na sessão"),
  empresas: z
    .array(
      z.object({
        empresaId: z.string().uuid().describe("Identificador da empresa"),
        nomeFantasia: z.string().describe("Nome fantasia da empresa"),
        perfilId: z.string().uuid().describe("Perfil do usuário nesta empresa"),
        perfilNome: z.string().describe("Nome do perfil, para exibição"),
      }),
    )
    .describe("Todas as empresas às quais o usuário está vinculado"),
  permissoes: z
    .array(z.string())
    .describe("Permissões da empresa ativa, no formato 'rotinaCodigo.acao' (ex.: 'empresas.editar')"),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const LOGIN_EXAMPLE: LoginInput = {
  email: "admin@demo.com",
  senha: "Admin@123",
};

export const AUTH_TOKENS_EXAMPLE: AuthTokens = {
  accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  refreshToken: "e143916e8210830c2fd02dfdc1fc27b6119fc73a9dfaf9132daca18487c129f",
  expiresIn: 900,
};

export const CURRENT_USER_EXAMPLE: CurrentUser = {
  id: "827167a9-93f9-4fd8-9cc5-dcd8077c600d",
  nome: "Administrador do Sistema",
  email: "admin@demo.com",
  empresaAtivaId: "2113ce67-5cf9-40e6-b1ed-fa88281c2a92",
  empresas: [
    {
      empresaId: "2113ce67-5cf9-40e6-b1ed-fa88281c2a92",
      nomeFantasia: "Empresa Demo",
      perfilId: "06b281c4-c6d6-454c-82c6-75106224bbfc",
      perfilNome: "Administrador",
    },
  ],
  permissoes: ["empresas.visualizar", "empresas.editar", "colaboradores.cadastrar"],
};

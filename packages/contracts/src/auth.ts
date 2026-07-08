import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email(),
  senha: z.string().min(1, "Informe a senha"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const refreshInputSchema = z.object({
  refreshToken: z.string(),
});
export type RefreshInput = z.infer<typeof refreshInputSchema>;

export const currentUserSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  email: z.string().email(),
  empresaAtivaId: z.string().uuid(),
  empresas: z.array(
    z.object({
      empresaId: z.string().uuid(),
      nomeFantasia: z.string(),
      perfilId: z.string().uuid(),
      perfilNome: z.string(),
    }),
  ),
  permissoes: z.array(z.string()),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

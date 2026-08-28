import { z } from "zod";

export const portalClienteConfigSchema = z.object({
  ativo: z.boolean().default(false),
  permitirAtualizarCadastro: z.boolean().default(false),
  permitirManterContatos: z.boolean().default(false),
  exibirDesconto: z.boolean().default(false),
  permitirSolicitarDesconto: z.boolean().default(false),
  descontoMaximoSolicitavel: z.coerce.number().min(0).max(100).default(0),
  exibirEstoque: z.boolean().default(false),
  permitirProdutoForaMix: z.boolean().default(true),
  diasValidadeCarrinho: z.coerce.number().int().min(1).max(90).default(7),
});
export type PortalClienteConfig = z.infer<typeof portalClienteConfigSchema>;

export const portalClienteLoginSchema = z.object({
  empresaAlias: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
  senha: z.string().min(8).max(128),
});
export type PortalClienteLogin = z.infer<typeof portalClienteLoginSchema>;

export const portalClienteRefreshSchema = z.object({
  refreshToken: z.string().min(32),
});
export type PortalClienteRefresh = z.infer<typeof portalClienteRefreshSchema>;

export const portalClienteContatoCreateSchema = z.object({
  clienteId: z.string().uuid(),
  perfilId: z.string().uuid().nullable().optional(),
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  telefone: z.string().trim().max(30).nullable().optional(),
  celular: z.string().trim().max(30).nullable().optional(),
  cargo: z.string().trim().max(80).nullable().optional(),
  principal: z.boolean().default(false),
  ativo: z.boolean().default(true),
  senhaInicial: z.string().min(8).max(128),
});
export type PortalClienteContatoCreate = z.infer<typeof portalClienteContatoCreateSchema>;

export const portalClienteHabilitarSchema = z.object({
  ativo: z.boolean(),
});

export const portalClienteMeSchema = z.object({
  contato: z.object({ id: z.string().uuid(), nome: z.string(), email: z.string() }),
  cliente: z.object({ id: z.string().uuid(), razaoSocial: z.string(), nomeFantasia: z.string().nullable() }),
  empresa: z.object({ id: z.string().uuid(), nomeFantasia: z.string(), logoUrl: z.string().nullable() }),
  permissoes: z.array(z.string()),
  config: portalClienteConfigSchema,
});
export type PortalClienteMe = z.infer<typeof portalClienteMeSchema>;

export const portalClienteTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});
export type PortalClienteTokens = z.infer<typeof portalClienteTokensSchema>;

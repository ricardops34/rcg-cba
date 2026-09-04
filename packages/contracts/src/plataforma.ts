import { z } from "zod";
import { paginationQuerySchema } from "./common";
import { situacaoEmpresaSchema } from "./empresa";

// ------------------------------------------------------------------
// Empresas, na visão de quem administra o SaaS
// ------------------------------------------------------------------

/**
 * Uma empresa na lista da administração da plataforma.
 *
 * Não é o cadastro completo (endereço, dados fiscais, banner): é o que se
 * precisa saber para decidir liberar, suspender ou ampliar. O cadastro
 * completo continua em `/empresas/:id`.
 */
export const plataformaEmpresaSchema = z.object({
  id: z.string().uuid(),
  razaoSocial: z.string(),
  nomeFantasia: z.string(),
  cnpj: z.string(),
  alias: z.string().nullable(),
  situacao: situacaoEmpresaSchema,
  testeExpiraEm: z.string().datetime().nullable(),
  limiteUsuarios: z.number().int().nullable(),

  /** Vínculos ativos hoje — o numerador do limite. */
  usuariosAtivos: z.number().int(),

  /**
   * Verdadeiro quando a empresa está em teste e a data já passou. Vem
   * calculado do servidor, e não da tela: é a mesma comparação que decide o
   * login, e duas implementações discordariam no fuso.
   */
  testeExpirado: z.boolean(),

  /** Último login de qualquer usuário da empresa. Null se ninguém entrou. */
  ultimoAcesso: z.string().datetime().nullable(),

  createdAt: z.string().datetime(),
});
export type PlataformaEmpresa = z.infer<typeof plataformaEmpresaSchema>;

export const plataformaEmpresaQuerySchema = paginationQuerySchema.extend({
  situacao: situacaoEmpresaSchema.optional(),
  /** Só as que estão em teste e já venceram. */
  apenasExpiradas: z.coerce.boolean().optional(),
});
export type PlataformaEmpresaQuery = z.infer<
  typeof plataformaEmpresaQuerySchema
>;

/**
 * Mudança de situação, prazo de teste e teto de usuários — as três coisas que
 * só a plataforma governa, num payload só porque na prática mudam juntas
 * ("libera mais 15 dias e sobe para 20 usuários").
 */
export const plataformaSituacaoUpdateSchema = z
  .object({
    situacao: situacaoEmpresaSchema.optional(),
    testeExpiraEm: z.string().datetime().nullable().optional(),
    limiteUsuarios: z.number().int().min(1).nullable().optional(),
    /** Fica no log, para explicar depois por que a empresa foi suspensa. */
    motivo: z.string().trim().max(500).optional(),
  })
  .refine(
    (v) =>
      v.situacao !== undefined ||
      v.testeExpiraEm !== undefined ||
      v.limiteUsuarios !== undefined,
    { message: "Informe ao menos um campo para alterar" },
  );
export type PlataformaSituacaoUpdate = z.infer<
  typeof plataformaSituacaoUpdateSchema
>;

/**
 * Empresa nova, com o primeiro administrador dela.
 *
 * Os dois juntos de propósito: uma empresa sem nenhum usuário que consiga
 * entrar não serve para nada, e criar em duas etapas deixa esse estado
 * inútil existindo no meio do caminho — inclusive se a segunda etapa falhar.
 */
export const plataformaEmpresaCreateSchema = z.object({
  razaoSocial: z.string().trim().min(2).max(150),
  nomeFantasia: z.string().trim().min(2).max(150),
  cnpj: z.string().trim().length(14, "CNPJ deve ter 14 dígitos"),
  alias: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen")
    .nullable()
    .optional(),

  situacao: situacaoEmpresaSchema.default("teste"),
  testeExpiraEm: z.string().datetime().nullable().optional(),
  limiteUsuarios: z.number().int().min(1).nullable().optional(),

  admin: z.object({
    nome: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(120),
    /** Provisória: o primeiro login exige troca. */
    senha: z.string().min(8).max(72),
  }),
});
export type PlataformaEmpresaCreate = z.infer<
  typeof plataformaEmpresaCreateSchema
>;

// ------------------------------------------------------------------
// Administradores da plataforma
// ------------------------------------------------------------------

export const plataformaAdminSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  email: z.string(),
  ativo: z.boolean(),
  ultimoLogin: z.string().datetime().nullable(),
});
export type PlataformaAdmin = z.infer<typeof plataformaAdminSchema>;

export const plataformaAdminUpdateSchema = z.object({
  administradorPlataforma: z.boolean(),
});
export type PlataformaAdminUpdate = z.infer<
  typeof plataformaAdminUpdateSchema
>;

// ------------------------------------------------------------------
// Log
// ------------------------------------------------------------------

export const plataformaAuditoriaSchema = z.object({
  id: z.string().uuid(),
  usuarioId: z.string(),
  usuarioEmail: z.string(),
  empresaId: z.string().nullable(),
  empresaRazaoSocial: z.string().nullable(),
  acao: z.string(),
  valorAnterior: z.string().nullable(),
  valorNovo: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PlataformaAuditoria = z.infer<typeof plataformaAuditoriaSchema>;

export const plataformaAuditoriaQuerySchema = paginationQuerySchema.extend({
  empresaId: z.string().uuid().optional(),
  acao: z.string().optional(),
});
export type PlataformaAuditoriaQuery = z.infer<
  typeof plataformaAuditoriaQuerySchema
>;

/** Rótulos das ações registradas, para a tela não decorar os verbos. */
export const PLATAFORMA_ACAO_LABEL: Record<string, string> = {
  "empresa.criada": "Empresa criada",
  "empresa.situacao_alterada": "Situação alterada",
  "empresa.teste_alterado": "Prazo de teste alterado",
  "empresa.limite_alterado": "Limite de usuários alterado",
  "admin.promovido": "Promovido a admin da plataforma",
  "admin.revogado": "Removido de admin da plataforma",
};

export const PLATAFORMA_EMPRESA_EXAMPLE: PlataformaEmpresa = {
  id: "b3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  razaoSocial: "Comercial Andrade Ltda",
  nomeFantasia: "Andrade Distribuidora",
  cnpj: "12345678000199",
  alias: "andrade",
  situacao: "teste",
  testeExpiraEm: "2026-10-03T00:00:00.000Z",
  limiteUsuarios: 10,
  usuariosAtivos: 4,
  testeExpirado: false,
  ultimoAcesso: "2026-09-03T18:22:00.000Z",
  createdAt: "2026-09-03T12:00:00.000Z",
};

/** Promoção pelo e-mail — ver `promoverPorEmail` no service. */
export const plataformaAdminPromoverSchema = z.object({
  email: z.string().trim().email().max(120),
});
export type PlataformaAdminPromover = z.infer<
  typeof plataformaAdminPromoverSchema
>;

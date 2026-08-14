import { z } from "zod";
import { paginationQuerySchema } from "./common";

/**
 * Auditoria de acesso: o que aconteceu na porta de entrada do sistema
 * (Administração > Acessos). Duas visões complementares:
 *
 * - **Eventos** (`AcessoLog`) — cada tentativa de autenticação e seu desfecho,
 *   incluindo as que falharam (senha errada, conta bloqueada, fora do
 *   expediente). É o rastro de segurança.
 * - **Sessões** (`Sessao`) — do login até o logout/expiração, com a duração
 *   apurada. É de onde sai o "tempo de uso" por usuário.
 */

export const acessoEventoSchema = z.enum([
  "login_sucesso",
  "login_falha",
  "login_bloqueado",
  "login_fora_horario",
  "acesso_fora_horario",
  "logout",
  "troca_empresa",
]);
export type AcessoEvento = z.infer<typeof acessoEventoSchema>;

export const ACESSO_EVENTO_LABEL: Record<AcessoEvento, string> = {
  login_sucesso: "Login efetuado",
  login_falha: "Tentativa sem sucesso",
  login_bloqueado: "Conta bloqueada",
  login_fora_horario: "Login fora do expediente",
  acesso_fora_horario: "Uso fora do expediente",
  logout: "Saída",
  troca_empresa: "Troca de empresa",
};

/** Eventos que representam tentativa de acesso negada. */
export const ACESSO_EVENTOS_FALHA: AcessoEvento[] = [
  "login_falha",
  "login_bloqueado",
  "login_fora_horario",
  "acesso_fora_horario",
];

export const acessoLogSchema = z.object({
  id: z.string().uuid(),
  // Null quando o e-mail informado não existe no cadastro — a tentativa é
  // registrada mesmo assim, porque é justamente o que interessa investigar.
  usuarioId: z.string().uuid().nullable(),
  usuarioNome: z.string().nullable(),
  // E-mail exatamente como digitado na tentativa.
  email: z.string(),
  empresaId: z.string().uuid().nullable(),
  evento: acessoEventoSchema,
  // Complemento legível do evento ("Senha incorreta", "Fora do expediente
  // (Seg 08:00–18:00)") — o que a tela mostra na coluna Detalhe.
  detalhe: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  criadoEm: z.string().datetime(),
});
export type AcessoLog = z.infer<typeof acessoLogSchema>;

export const sessaoSchema = z.object({
  id: z.string().uuid(),
  usuarioId: z.string().uuid(),
  usuarioNome: z.string(),
  email: z.string(),
  empresaId: z.string().uuid().nullable(),
  iniciadaEm: z.string().datetime(),
  // Atualizada a cada renovação de token (~15 min) e na troca de empresa —
  // é o que mede o tempo de uso de uma sessão ainda aberta.
  ultimaAtividadeEm: z.string().datetime(),
  encerradaEm: z.string().datetime().nullable(),
  motivoFim: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  /** Duração em minutos: (encerradaEm ?? ultimaAtividadeEm) − iniciadaEm. */
  duracaoMinutos: z.number(),
  /** Sessão sem encerramento e com atividade recente. */
  ativa: z.boolean(),
});
export type Sessao = z.infer<typeof sessaoSchema>;

/** Uma linha do ranking de tempo de uso por usuário, no período consultado. */
export const acessoResumoUsuarioSchema = z.object({
  usuarioId: z.string().uuid(),
  usuarioNome: z.string(),
  email: z.string(),
  sessoes: z.number().int(),
  minutosTotal: z.number(),
  minutosMedio: z.number(),
  ultimoAcesso: z.string().datetime().nullable(),
  tentativasFalha: z.number().int(),
});
export type AcessoResumoUsuario = z.infer<typeof acessoResumoUsuarioSchema>;

export const acessoResumoSchema = z.object({
  loginsSucesso: z.number().int(),
  tentativasFalha: z.number().int(),
  usuariosDistintos: z.number().int(),
  sessoesAbertas: z.number().int(),
  minutosTotal: z.number(),
  minutosMedioPorSessao: z.number(),
  porUsuario: z.array(acessoResumoUsuarioSchema),
});
export type AcessoResumo = z.infer<typeof acessoResumoSchema>;

/**
 * Filtros das três rotas (eventos, sessões e resumo). Sem período informado, a
 * API assume os últimos 30 dias — ver AcessosService.
 */
export const acessoQuerySchema = paginationQuerySchema.extend({
  usuarioId: z.string().uuid().optional(),
  evento: acessoEventoSchema.optional(),
  // Só as tentativas negadas (atalho do filtro "Somente sem sucesso").
  somenteFalhas: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => v === true || v === "true")
    .optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
});
export type AcessoQuery = z.infer<typeof acessoQuerySchema>;

export const ACESSO_LOG_EXAMPLE: AcessoLog = {
  id: "3f1c9a5e-2b7d-4c81-9f0a-5d6e7b8c9a01",
  usuarioId: "827167a9-93f9-4fd8-9cc5-dcd8077c600d",
  usuarioNome: "Maria Souza",
  email: "maria.souza@empresademo.com",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  evento: "login_sucesso",
  detalhe: null,
  ip: "189.45.12.7",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  criadoEm: "2026-08-14T11:02:31.000Z",
};

export const SESSAO_EXAMPLE: Sessao = {
  id: "9b8c7d6e-5f40-4312-a1b2-c3d4e5f60718",
  usuarioId: "827167a9-93f9-4fd8-9cc5-dcd8077c600d",
  usuarioNome: "Maria Souza",
  email: "maria.souza@empresademo.com",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  iniciadaEm: "2026-08-14T11:02:31.000Z",
  ultimaAtividadeEm: "2026-08-14T15:47:10.000Z",
  encerradaEm: "2026-08-14T15:47:10.000Z",
  motivoFim: "logout",
  ip: "189.45.12.7",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  duracaoMinutos: 284.65,
  ativa: false,
};

export const ACESSO_RESUMO_EXAMPLE: AcessoResumo = {
  loginsSucesso: 142,
  tentativasFalha: 9,
  usuariosDistintos: 11,
  sessoesAbertas: 3,
  minutosTotal: 38420,
  minutosMedioPorSessao: 270.6,
  porUsuario: [
    {
      usuarioId: "827167a9-93f9-4fd8-9cc5-dcd8077c600d",
      usuarioNome: "Maria Souza",
      email: "maria.souza@empresademo.com",
      sessoes: 21,
      minutosTotal: 5680,
      minutosMedio: 270.5,
      ultimoAcesso: "2026-08-14T11:02:31.000Z",
      tentativasFalha: 1,
    },
  ],
};

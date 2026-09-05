import { z } from "zod";
import { paginationQuerySchema } from "./common";

/**
 * Log de erros (Plataforma > Erros). Ver `docs/planos/log-de-erros.md`.
 *
 * Duas famílias, e é por isso que existe `origem`:
 *
 * - **servidor** — exceção que passou pelo `AllExceptionsFilter`. É o que o
 *   servidor processou.
 * - **cliente** — falha que o navegador viu e a API nunca soube: rede caiu,
 *   API fora, resposta que não era JSON, erro de JavaScript. Sem esta metade
 *   a tela responderia "nenhum erro" justamente no incidente que motivou a
 *   ferramenta (a API estava reiniciando e a requisição não chegou).
 *
 * O log é lido **só pela administração da plataforma**: a mensagem e o stack
 * carregam dado de cliente, e filtrá-los antes de gravar custaria o próprio
 * diagnóstico.
 */

export const erroOrigemSchema = z.enum(["servidor", "cliente"]);
export type ErroOrigem = z.infer<typeof erroOrigemSchema>;

export const ERRO_ORIGEM_LABEL: Record<ErroOrigem, string> = {
  servidor: "Servidor",
  cliente: "Navegador",
};

/**
 * Que tipo de falha é. No servidor sai da própria exceção; no cliente, de
 * onde o report nasceu — e é essa distinção que diz se a requisição chegou a
 * sair (`rede` = não saiu).
 */
export const erroTipoSchema = z.enum([
  /** Exceção não tratada no servidor (500). */
  "excecao",
  /** HttpException com status conhecido (4xx só com o interruptor ligado). */
  "http",
  /** `fetch` rejeitou: API fora, DNS, conexão recusada, timeout. */
  "rede",
  /** Respondeu, mas o corpo não era o esperado (HTML de proxy, JSON quebrado). */
  "resposta",
  /** `window.onerror` — erro de JavaScript na tela. */
  "javascript",
  /** `unhandledrejection` — promessa rejeitada sem tratamento. */
  "promessa",
]);
export type ErroTipo = z.infer<typeof erroTipoSchema>;

export const ERRO_TIPO_LABEL: Record<ErroTipo, string> = {
  excecao: "Exceção",
  http: "HTTP",
  rede: "Rede",
  resposta: "Resposta inválida",
  javascript: "JavaScript",
  promessa: "Promessa rejeitada",
};

// --------------------------------------------------------------- ocorrência

export const erroLogSchema = z.object({
  id: z.string().uuid(),
  origem: erroOrigemSchema,
  tipo: erroTipoSchema,

  /**
   * Quando aconteceu. No cliente é o relógio do navegador: o report fica em
   * buffer e pode chegar minutos depois, quando a conexão voltar — por isso
   * não dá para usar a hora de chegada como hora do fato.
   */
  ocorridoEm: z.string().datetime(),
  /** Quando a linha entrou no banco. */
  criadoEm: z.string().datetime(),
  /** A última repetição absorvida por esta linha (ver `ocorrencias`). */
  ultimaEm: z.string().datetime(),

  /**
   * Repetições colapsadas nesta linha. O mesmo erro em rajada (bug em laço)
   * vira contador em vez de milhares de linhas — ver `ErrosLogService`.
   */
  ocorrencias: z.number().int(),

  /** Caminho como veio: `/api/v1/clientes/8f2c.../contatos`. */
  rota: z.string(),
  /** O mesmo caminho com os ids trocados por `:id` — é o que agrupa. */
  rotaPadrao: z.string(),
  metodo: z.string().nullable(),
  /** Null em erro de JavaScript e quando a requisição nem chegou a sair. */
  status: z.number().int().nullable(),
  /** Endereço da tela onde o usuário estava (só nos erros de cliente). */
  pagina: z.string().nullable(),

  mensagem: z.string(),
  /** Mensagem normalizada (sem ids, números e aspas) — o texto que agrupa. */
  resumo: z.string(),
  stack: z.string().nullable(),

  /** Chave de agrupamento: origem + tipo + rotaPadrao + método + status + resumo. */
  assinatura: z.string(),

  usuarioId: z.string().uuid().nullable(),
  usuarioEmail: z.string().nullable(),
  empresaId: z.string().uuid().nullable(),
  /** Guardada junto para o log continuar legível se a empresa for excluída. */
  empresaRazaoSocial: z.string().nullable(),

  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
});
export type ErroLog = z.infer<typeof erroLogSchema>;

// ------------------------------------------------------------------- grupo

/**
 * Uma linha da tela: todas as ocorrências com a mesma assinatura.
 *
 * Sem isto, um erro repetido empurra todos os outros para fora da primeira
 * página — que é a única que alguém olha.
 */
export const erroLogGrupoSchema = z.object({
  assinatura: z.string(),
  origem: erroOrigemSchema,
  tipo: erroTipoSchema,
  rotaPadrao: z.string(),
  metodo: z.string().nullable(),
  status: z.number().int().nullable(),
  resumo: z.string(),
  /** Soma das ocorrências do grupo (já contando as repetições colapsadas). */
  ocorrencias: z.number().int(),
  /** Quantas linhas o grupo tem — menor que `ocorrencias` quando houve rajada. */
  linhas: z.number().int(),
  primeiraEm: z.string().datetime(),
  ultimaEm: z.string().datetime(),
});
export type ErroLogGrupo = z.infer<typeof erroLogGrupoSchema>;

export const erroLogResumoSchema = z.object({
  /** Ocorrências nas últimas 24 horas. */
  ultimas24h: z.number().int(),
  ultimos7Dias: z.number().int(),
  /** Assinaturas distintas no período consultado. */
  gruposDistintos: z.number().int(),
  doServidor: z.number().int(),
  doCliente: z.number().int(),
  /** Empresas com pelo menos um erro no período. */
  empresasAfetadas: z.number().int(),
});
export type ErroLogResumo = z.infer<typeof erroLogResumoSchema>;

// ------------------------------------------------------------------ filtros

/** Sem período informado, a API assume os últimos 7 dias — ver ErrosLogService. */
export const erroLogQuerySchema = paginationQuerySchema.extend({
  origem: erroOrigemSchema.optional(),
  tipo: erroTipoSchema.optional(),
  empresaId: z.string().uuid().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
});
export type ErroLogQuery = z.infer<typeof erroLogQuerySchema>;

/** Ocorrências de um grupo (o detalhe que abre ao clicar na linha). */
export const erroLogOcorrenciaQuerySchema = paginationQuerySchema.extend({
  assinatura: z.string().min(1),
});
export type ErroLogOcorrenciaQuery = z.infer<
  typeof erroLogOcorrenciaQuerySchema
>;

// ---------------------------------------------------------- report do cliente

/**
 * O que o navegador manda. Os limites de tamanho existem para o report não
 * virar um canal de escrita livre: a rota é autenticada, mas quem está logado
 * não deveria conseguir encher a tabela com texto arbitrário.
 */
export const erroClienteItemSchema = z.object({
  tipo: z.enum(["rede", "resposta", "javascript", "promessa"]),
  ocorridoEm: z.string().datetime(),
  rota: z.string().max(500),
  metodo: z.string().max(10).optional(),
  /** Ausente quando a requisição não chegou a receber resposta. */
  status: z.number().int().min(0).max(599).optional(),
  pagina: z.string().max(500).optional(),
  mensagem: z.string().max(1000),
  stack: z.string().max(8000).optional(),
});
export type ErroClienteItem = z.infer<typeof erroClienteItemSchema>;

/**
 * O envio é em lote porque o buffer local acumula enquanto a API está fora e
 * descarrega de uma vez quando ela volta — que é justamente o caso que a
 * captura no cliente existe para cobrir.
 */
export const erroClienteReportSchema = z.object({
  erros: z.array(erroClienteItemSchema).min(1).max(50),
});
export type ErroClienteReport = z.infer<typeof erroClienteReportSchema>;

// ----------------------------------------------------------------- config

export const erroLogConfigSchema = z.object({
  /** 0 = sem expurgo por tempo. */
  retencaoDias: z.number().int(),
  /** Máximo de linhas por empresa; 0 = sem teto. Corta as mais antigas. */
  tetoPorEmpresa: z.number().int(),
  /**
   * Grava também os 4xx. Desligado por padrão: "campo obrigatório" é erro de
   * quem preencheu, e registrar tudo esconde o 500 que importa. É interruptor
   * de investigação pontual — ligar, reproduzir, desligar.
   */
  registrar4xx: z.boolean(),
  atualizadoEm: z.string().datetime().nullable(),
});
export type ErroLogConfig = z.infer<typeof erroLogConfigSchema>;

export const erroLogConfigUpdateSchema = z.object({
  retencaoDias: z.number().int().min(0).max(3650).optional(),
  tetoPorEmpresa: z.number().int().min(0).max(1_000_000).optional(),
  registrar4xx: z.boolean().optional(),
});
export type ErroLogConfigUpdate = z.infer<typeof erroLogConfigUpdateSchema>;

// ---------------------------------------------------------------- exemplos

export const ERRO_LOG_GRUPO_EXAMPLE: ErroLogGrupo = {
  assinatura: "4f9c1a7b2d3e5061",
  origem: "cliente",
  tipo: "rede",
  rotaPadrao: "/api/v1/agente/config",
  metodo: "PATCH",
  status: null,
  resumo: "Failed to fetch",
  ocorrencias: 12,
  linhas: 4,
  primeiraEm: "2026-09-04T11:02:31.000Z",
  ultimaEm: "2026-09-04T11:09:48.000Z",
};

export const ERRO_LOG_CONFIG_EXAMPLE: ErroLogConfig = {
  retencaoDias: 30,
  tetoPorEmpresa: 5000,
  registrar4xx: false,
  atualizadoEm: "2026-09-04T11:00:00.000Z",
};

import { z } from "zod";

/**
 * WhatsApp do vendedor — Fatia 1 (conectar e conversar).
 * Ver `docs/planos/whatsapp-vendedor.md`.
 *
 * Duas regras deste módulo estão codificadas aqui e não devem ser afrouxadas
 * sem decisão explícita:
 *
 * 1. **A credencial de sessão nunca sai da API.** Nenhum schema de leitura
 *    expõe `credencialCifrada` — o mesmo tratamento da chave do agente de IA.
 * 2. **Só se persiste conversa de contato ligado a cliente.** O schema de
 *    conversa carrega `clienteId` nulo apenas para o caso "existe uma conversa
 *    não vinculada"; mensagem sem vínculo não é gravada.
 */

export const WHATSAPP_TRANSPORTES = ["zapo", "cloud_api"] as const;
export const whatsappTransporteSchema = z.enum(WHATSAPP_TRANSPORTES);
export type WhatsappTransporte = z.infer<typeof whatsappTransporteSchema>;

export const WHATSAPP_SESSAO_STATUS = [
  "desconectada",
  "pareando",
  "conectada",
  "banida",
] as const;
export const whatsappSessaoStatusSchema = z.enum(WHATSAPP_SESSAO_STATUS);
export type WhatsappSessaoStatus = z.infer<typeof whatsappSessaoStatusSchema>;

export const whatsappDirecaoSchema = z.enum(["entrada", "saida"]);
export type WhatsappDirecao = z.infer<typeof whatsappDirecaoSchema>;

export const whatsappTipoMensagemSchema = z.enum([
  "texto",
  "imagem",
  "documento",
  "audio",
  "video",
  "localizacao",
  "contato",
  "outro",
]);
export type WhatsappTipoMensagem = z.infer<typeof whatsappTipoMensagemSchema>;

export const whatsappStatusEntregaSchema = z.enum([
  "pendente",
  "enviada",
  "entregue",
  "lida",
  "erro",
]);
export type WhatsappStatusEntrega = z.infer<typeof whatsappStatusEntregaSchema>;

/**
 * Texto do aceite que o vendedor confirma ao conectar. A versão fica gravada
 * na sessão: mudou o texto, o aceite antigo não vale mais para o novo teor.
 */
export const WHATSAPP_ACEITE_VERSAO = "2026-08-14";
export const WHATSAPP_ACEITE_TEXTO =
  "Ao conectar, as conversas com contatos vinculados a clientes serão gravadas " +
  "na plataforma e poderão ser consultadas pelo seu supervisor e pelo gerente. " +
  "Conversas com contatos não vinculados a clientes não são gravadas.";

// --------------------------------------------------------------------------
// Configuração da empresa (Configurações > WhatsApp)
// --------------------------------------------------------------------------

export const whatsappConfigSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  ativo: z.boolean(),
  transporte: whatsappTransporteSchema,
  workerUrl: z.string().nullable(),
  retencaoDias: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WhatsappConfig = z.infer<typeof whatsappConfigSchema>;

export const whatsappConfigUpdateSchema = z.object({
  ativo: z.boolean().optional(),
  transporte: whatsappTransporteSchema.optional(),
  workerUrl: z
    .string()
    .trim()
    .url("Informe uma URL válida (ex.: http://whatsapp-worker:3100)")
    .nullable()
    .optional(),
  retencaoDias: z
    .number()
    .int()
    .min(0)
    .max(3650)
    .optional()
    .describe("0 = guardar indefinidamente"),
});
export type WhatsappConfigUpdate = z.infer<typeof whatsappConfigUpdateSchema>;

// --------------------------------------------------------------------------
// Sessão
// --------------------------------------------------------------------------

export const whatsappSessaoSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  vendedorId: z.string().uuid(),
  vendedorNome: z.string().describe("Desnormalizado para a tela da equipe"),
  numero: z.string().nullable().describe("Número conectado, quando pareado"),
  status: whatsappSessaoStatusSchema,
  transporte: whatsappTransporteSchema,
  ultimaConexao: z.string().datetime().nullable(),
  ultimoErro: z.string().nullable(),
  aceiteEm: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WhatsappSessao = z.infer<typeof whatsappSessaoSchema>;

/** Início do pareamento. O aceite é obrigatório — sem ele não há sessão. */
export const whatsappConectarSchema = z.object({
  aceite: z
    .literal(true)
    .describe("Confirmação de que o vendedor leu WHATSAPP_ACEITE_TEXTO"),
  aceiteVersao: z.string().default(WHATSAPP_ACEITE_VERSAO),
});
export type WhatsappConectar = z.infer<typeof whatsappConectarSchema>;

/**
 * Estado do pareamento, consultado pela tela enquanto o QR não é lido.
 *
 * O QR expira em segundos e é renovado pelo provedor; a tela repinta a cada
 * atualização em vez de manter o primeiro código na tela.
 */
export const whatsappPareamentoSchema = z.object({
  status: whatsappSessaoStatusSchema,
  qr: z.string().nullable().describe("Conteúdo do QR a renderizar; null quando não há"),
  numero: z.string().nullable(),
  erro: z.string().nullable(),
});
export type WhatsappPareamento = z.infer<typeof whatsappPareamentoSchema>;

// --------------------------------------------------------------------------
// Contato e conversa
// --------------------------------------------------------------------------

export const whatsappContatoSchema = z.object({
  id: z.string().uuid(),
  jid: z.string(),
  nomeExibicao: z.string().nullable(),
  telefoneNormalizado: z.string().nullable(),
  clienteId: z.string().uuid().nullable(),
  clienteRazaoSocial: z.string().nullable(),
  clienteCodigoErp: z.string().nullable(),
  ignorado: z.boolean(),
});
export type WhatsappContato = z.infer<typeof whatsappContatoSchema>;

export const whatsappConversaSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  sessaoId: z.string().uuid(),
  contato: whatsappContatoSchema,
  clienteId: z.string().uuid().nullable(),
  ultimaMensagemEm: z.string().datetime().nullable(),
  ultimaMensagemPrevia: z
    .string()
    .nullable()
    .describe("Primeiros caracteres da última mensagem, para a lista"),
  naoLidas: z.number().int(),
  arquivada: z.boolean(),
  // Identifica de quem é a conversa quando o supervisor lista as da equipe.
  vendedorId: z.string().uuid(),
  vendedorNome: z.string(),
});
export type WhatsappConversa = z.infer<typeof whatsappConversaSchema>;

export const whatsappConversaQuerySchema = z.object({
  busca: z.string().trim().optional(),
  arquivadas: z.coerce.boolean().default(false),
  semVinculo: z
    .coerce
    .boolean()
    .default(false)
    .describe("Só as conversas de contato ainda não ligado a cliente"),
  // Presente só para supervisor/gerente; vendedor sempre vê a própria carteira.
  vendedorId: z.string().uuid().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  tamanho: z.coerce.number().int().min(1).max(100).default(30),
});
export type WhatsappConversaQuery = z.infer<typeof whatsappConversaQuerySchema>;

/** Vínculo manual do contato a um cliente — é o que autoriza a gravação. */
export const whatsappVincularSchema = z.object({
  clienteId: z.string().uuid().nullable().describe("null desfaz o vínculo"),
  ignorar: z
    .boolean()
    .default(false)
    .describe("Marca como não-cliente para a tela parar de perguntar"),
});
export type WhatsappVincular = z.infer<typeof whatsappVincularSchema>;

// --------------------------------------------------------------------------
// Mensagens
// --------------------------------------------------------------------------

export const whatsappMensagemSchema = z.object({
  id: z.string().uuid(),
  conversaId: z.string().uuid(),
  externoId: z.string(),
  direcao: whatsappDirecaoSchema,
  tipo: whatsappTipoMensagemSchema,
  conteudo: z.string().nullable(),
  arquivoUrl: z.string().nullable(),
  arquivoNome: z.string().nullable(),
  enviadaPor: z.string().uuid().nullable(),
  enviadaPorNome: z.string().nullable(),
  statusEntrega: whatsappStatusEntregaSchema,
  criadaEm: z.string().datetime(),
});
export type WhatsappMensagem = z.infer<typeof whatsappMensagemSchema>;

export const whatsappMensagemQuerySchema = z.object({
  // Paginação por cursor: o rolo carrega para trás, e offset numa lista que
  // cresce pela ponta faz a mesma mensagem aparecer duas vezes.
  antesDe: z.string().datetime().optional(),
  tamanho: z.coerce.number().int().min(1).max(100).default(50),
});
export type WhatsappMensagemQuery = z.infer<typeof whatsappMensagemQuerySchema>;

export const whatsappEnviarSchema = z.object({
  texto: z.string().trim().min(1, "Mensagem vazia").max(4096),
});
export type WhatsappEnviar = z.infer<typeof whatsappEnviarSchema>;

// --------------------------------------------------------------------------
// Exemplos para o Swagger
// --------------------------------------------------------------------------

export const WHATSAPP_SESSAO_EXAMPLE: WhatsappSessao = {
  id: "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  vendedorId: "9c8d7e6f-5a4b-4c3d-2e1f-0a9b8c7d6e5f",
  vendedorNome: "MARCOS ANTONIO",
  numero: "5567999998888",
  status: "conectada",
  transporte: "zapo",
  ultimaConexao: "2026-08-14T18:30:00.000Z",
  ultimoErro: null,
  aceiteEm: "2026-08-14T18:29:00.000Z",
  createdAt: "2026-08-14T18:29:00.000Z",
  updatedAt: "2026-08-14T18:30:00.000Z",
};

export const WHATSAPP_MENSAGEM_EXAMPLE: WhatsappMensagem = {
  id: "1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7081",
  conversaId: "2c3d4e5f-6071-4829-ab3c-4d5e6f708192",
  externoId: "3EB0C767D26B8A3F1B2C",
  direcao: "entrada",
  tipo: "texto",
  conteudo: "Bom dia, consegue me mandar o orçamento daquele item?",
  arquivoUrl: null,
  arquivoNome: null,
  enviadaPor: null,
  enviadaPorNome: null,
  statusEntrega: "entregue",
  criadaEm: "2026-08-14T18:31:00.000Z",
};

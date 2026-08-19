import { z } from "zod";

/**
 * Feed do sino.
 *
 * A notificação é **persistida** (tabela `notificacoes`): quem provoca o fato
 * — mensagem recebida, orçamento aprovado, atividade que venceu — grava a
 * linha para o destinatário. O sino lê só isso, e é por isso que existe "lido"
 * de verdade, e não um estado deduzido do dado de origem.
 */
export const NOTIFICACAO_TIPOS = [
  "whatsapp_mensagem",
  "whatsapp_agendamento_erro",
  "atividade_vencimento",
  "orcamento_aprovado",
  "orcamento_recusado",
  "cliente_atribuido",
  "titulo_vencido",
] as const;
export const notificacaoTipoSchema = z.enum(NOTIFICACAO_TIPOS);
export type NotificacaoTipo = z.infer<typeof notificacaoTipoSchema>;

export const notificacaoItemSchema = z.object({
  id: z.string().uuid(),
  tipo: notificacaoTipoSchema,
  titulo: z.string(),
  descricao: z.string().nullable(),
  /** Quando o fato aconteceu — ordena o feed, e pode ser anterior à criação. */
  data: z.string().datetime(),
  /** Para onde a linha leva ao ser clicada. */
  rota: z.string().nullable(),
  /**
   * Ocorrências agrupadas: as mensagens novas da conversa. A tela monta o
   * texto a partir daqui em vez de o backend gravar "3 mensagens novas" —
   * número gravado envelhece na quarta mensagem.
   */
  contador: z.number().int(),
});
export type NotificacaoItem = z.infer<typeof notificacaoItemSchema>;

export const notificacoesFeedSchema = z.object({
  /** Não lidas do usuário — o número do badge. Conta todas, não só as listadas. */
  total: z.number().int(),
  itens: z.array(notificacaoItemSchema),
});
export type NotificacoesFeed = z.infer<typeof notificacoesFeedSchema>;

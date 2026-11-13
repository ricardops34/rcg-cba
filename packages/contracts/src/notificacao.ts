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
  // Cliente esperando alguem assumir no numero institucional da empresa.
  "whatsapp_aguardando",
  /** Lead captado pela IA no número institucional, aguardando a supervisão. */
  "lead_novo",
  /** Recado interno da equipe enviado para o usuário. */
  "recado_interno",
  /** O "Calcular" em lote da Sugestão de Compra terminou (ou falhou). */
  "sugestao_compra_calculada",
  /** A atualização em lote dos clientes pela Receita terminou (ou falhou). */
  "clientes_receita_atualizados",
  /** Chegou a hora de um atendimento agendado por WhatsApp. */
  "atendimento_agendado",
  /** A hora de um atendimento agendado passou sem o vendedor estar no sistema. */
  "atendimento_nao_realizado",
  /** Antes de iniciar os atendimentos do roteiro do dia, o vendedor confirma. */
  "roteiro_confirmar",
  /** A conversa do roteiro foi iniciada. */
  "roteiro_iniciado",
  /** Supervisão: o vendedor cancelou atendimentos do roteiro. */
  "roteiro_cancelado",
  /** Supervisão: o horário passou sem o atendimento ser feito. */
  "roteiro_atraso",
  "desconto_pendente",
  "desconto_liberado",
  "desconto_recusado",
] as const;
export const notificacaoTipoSchema = z.enum(NOTIFICACAO_TIPOS);
export type NotificacaoTipo = z.infer<typeof notificacaoTipoSchema>;

/**
 * Como cada tipo aparece em "Meu perfil > Notificações", onde o usuário
 * escolhe o que chega no sino. Agrupado por assunto; o `Record` em
 * `NOTIFICACAO_TIPO_INFO` obriga todo tipo novo do enum a ganhar nome aqui.
 */
export const NOTIFICACAO_TIPO_INFO: Record<
  NotificacaoTipo,
  { grupo: NotificacaoGrupo; nome: string; descricao: string }
> = {
  whatsapp_mensagem: {
    grupo: "whatsapp",
    nome: "Mensagem nova",
    descricao: "Cliente mandou mensagem numa conversa sua.",
  },
  whatsapp_aguardando: {
    grupo: "whatsapp",
    nome: "Cliente aguardando atendimento",
    descricao: "Alguém espera ser assumido no número da empresa.",
  },
  whatsapp_agendamento_erro: {
    grupo: "whatsapp",
    nome: "Falha em mensagem agendada",
    descricao: "Uma mensagem programada não pôde ser enviada.",
  },
  lead_novo: {
    grupo: "whatsapp",
    nome: "Lead novo",
    descricao: "A IA captou um contato novo no número da empresa.",
  },
  atendimento_agendado: {
    grupo: "agenda",
    nome: "Hora do atendimento agendado",
    descricao: "Chegou a hora de um atendimento que você agendou.",
  },
  atendimento_nao_realizado: {
    grupo: "agenda",
    nome: "Atendimento agendado não realizado",
    descricao: "A hora de um atendimento passou sem ele ser feito.",
  },
  atividade_vencimento: {
    grupo: "agenda",
    nome: "Atividade vencendo",
    descricao: "Tarefa ou compromisso da agenda vencido ou vencendo.",
  },
  roteiro_confirmar: {
    grupo: "agenda",
    nome: "Confirmar roteiro do dia",
    descricao: "Pedido para confirmar os atendimentos do roteiro.",
  },
  roteiro_iniciado: {
    grupo: "agenda",
    nome: "Roteiro iniciado",
    descricao: "A conversa de um atendimento do roteiro começou.",
  },
  roteiro_cancelado: {
    grupo: "equipe",
    nome: "Roteiro cancelado pelo vendedor",
    descricao: "Um vendedor da sua equipe cancelou atendimentos do roteiro.",
  },
  roteiro_atraso: {
    grupo: "equipe",
    nome: "Roteiro atrasado",
    descricao: "O horário passou sem o vendedor fazer o atendimento.",
  },
  desconto_pendente: {
    grupo: "equipe",
    nome: "Desconto aguardando sua liberação",
    descricao: "Orçamento com desconto acima do máximo esperando você.",
  },
  recado_interno: {
    grupo: "equipe",
    nome: "Recado interno",
    descricao: "Recado da equipe enviado para você.",
  },
  orcamento_aprovado: {
    grupo: "vendas",
    nome: "Orçamento aprovado",
    descricao: "O cliente aprovou um orçamento seu.",
  },
  orcamento_recusado: {
    grupo: "vendas",
    nome: "Orçamento recusado",
    descricao: "O cliente recusou um orçamento seu.",
  },
  desconto_liberado: {
    grupo: "vendas",
    nome: "Desconto liberado",
    descricao: "O superior liberou o desconto que você pediu.",
  },
  desconto_recusado: {
    grupo: "vendas",
    nome: "Desconto recusado",
    descricao: "O superior recusou o desconto que você pediu.",
  },
  cliente_atribuido: {
    grupo: "clientes",
    nome: "Cliente entrou na sua carteira",
    descricao: "Um cliente passou a ser atendido por você.",
  },
  titulo_vencido: {
    grupo: "clientes",
    nome: "Título vencido",
    descricao: "Cliente da sua carteira com título em atraso.",
  },
  sugestao_compra_calculada: {
    grupo: "processos",
    nome: "Sugestão de compra calculada",
    descricao: "O cálculo em lote da Sugestão de Compra terminou.",
  },
  clientes_receita_atualizados: {
    grupo: "processos",
    nome: "Clientes atualizados pela Receita",
    descricao: "A atualização em lote dos clientes terminou.",
  },
};

export const NOTIFICACAO_GRUPOS = [
  { id: "whatsapp", nome: "WhatsApp" },
  { id: "agenda", nome: "Agenda e roteiro" },
  { id: "vendas", nome: "Orçamentos" },
  { id: "clientes", nome: "Clientes" },
  { id: "equipe", nome: "Equipe e supervisão" },
  { id: "processos", nome: "Processos em lote" },
] as const;
export type NotificacaoGrupo = (typeof NOTIFICACAO_GRUPOS)[number]["id"];

export const updateNotificacoesSilenciadasSchema = z.object({
  notificacoesSilenciadas: z
    .array(notificacaoTipoSchema)
    .max(NOTIFICACAO_TIPOS.length)
    .describe("Tipos que o usuário desligou do sino; vazio = recebe todos"),
});
export type UpdateNotificacoesSilenciadasInput = z.infer<
  typeof updateNotificacoesSilenciadasSchema
>;

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

import { z } from "zod";

/**
 * Roteiro semanal de atendimentos por WhatsApp
 * (docs/planos/2026-10-16-agendamentos-whatsapp.md, §7).
 *
 * O vendedor escolhe um período curto (até 15 dias), o intervalo entre as
 * conversas e os critérios de clientes; o sistema monta uma **prévia** com o
 * cliente de cada horário livre, o vendedor revisa e só então grava. Na hora,
 * depois da confirmação dele, o sistema abre cada conversa com uma saudação.
 */

export const ROTEIRO_MAX_DIAS = 15;

/** Por que o cliente entrou no roteiro. */
export const ROTEIRO_MOTIVOS = [
  "titulo_vencido",
  "sem_compra",
  "nao_comprou_no_mes",
  "mesmo_periodo_mes_passado",
] as const;
export const roteiroMotivoSchema = z.enum(ROTEIRO_MOTIVOS);
export type RoteiroMotivo = z.infer<typeof roteiroMotivoSchema>;

export const ROTEIRO_MOTIVO_ROTULO: Record<RoteiroMotivo, string> = {
  titulo_vencido: "Título vencido",
  sem_compra: "Sem comprar há tempo",
  nao_comprou_no_mes: "Comprou no mês passado e ainda não neste mês",
  mesmo_periodo_mes_passado: "Comprou no mesmo período do mês passado",
};

export const roteiroCriteriosSchema = z
  .object({
    /** Clientes que não compram há pelo menos N dias (quem nunca comprou não entra). */
    semCompraDias: z.number().int().min(1).max(720).nullable().optional(),
    tituloVencido: z.boolean().default(false),
    naoCompraramNoMes: z.boolean().default(false),
    mesmoPeriodoMesPassado: z.boolean().default(false),
  })
  .refine(
    (c) =>
      !!c.semCompraDias ||
      c.tituloVencido ||
      c.naoCompraramNoMes ||
      c.mesmoPeriodoMesPassado,
    { message: "Escolha ao menos um critério de clientes" },
  );
export type RoteiroCriterios = z.infer<typeof roteiroCriteriosSchema>;

const dia = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data")
  .describe("AAAA-MM-DD");
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const roteiroParametrosSchema = z
  .object({
    dataInicio: dia,
    dataFim: dia,
    /** Minutos entre o início de uma conversa e a próxima; cada atendimento ocupa esse tempo. */
    intervaloMin: z.number().int().min(5).max(240),
    criterios: roteiroCriteriosSchema,
    /**
     * Só vale para quem **não tem horário de trabalho cadastrado**: quem tem
     * usa o expediente do próprio cadastro.
     */
    horaInicio: hora.optional(),
    horaFim: hora.optional(),
  })
  .refine((p) => p.dataFim >= p.dataInicio, {
    message: "A data final não pode ser anterior à inicial",
    path: ["dataFim"],
  })
  .refine(
    (p) =>
      (Date.parse(`${p.dataFim}T00:00:00Z`) - Date.parse(`${p.dataInicio}T00:00:00Z`)) /
        86_400_000 <
      ROTEIRO_MAX_DIAS,
    { message: `O período pode ter no máximo ${ROTEIRO_MAX_DIAS} dias`, path: ["dataFim"] },
  )
  .refine((p) => !p.horaInicio || !p.horaFim || p.horaFim > p.horaInicio, {
    message: "O fim do dia deve ser depois do início",
    path: ["horaFim"],
  });
export type RoteiroParametros = z.infer<typeof roteiroParametrosSchema>;

/** Um cliente com o horário proposto. */
export const roteiroPreviaItemSchema = z.object({
  clienteId: z.string().uuid(),
  clienteNome: z.string(),
  quando: z.string().datetime(),
  motivos: z.array(roteiroMotivoSchema),
  /** Detalhes que ajudam a decidir (dias sem comprar, valor em atraso…). */
  detalhe: z.string().nullable(),
  /** De onde vem a conversa: já existe, existe o contato, ou nasce do cadastro. */
  origem: z.enum(["conversa", "contato", "cadastro"]),
});
export type RoteiroPreviaItem = z.infer<typeof roteiroPreviaItemSchema>;

export const roteiroPreviaSchema = z.object({
  itens: z.array(roteiroPreviaItemSchema),
  /** Entram nos critérios, mas não coube horário livre. */
  semHorario: z.array(
    z.object({ clienteId: z.string().uuid(), clienteNome: z.string() }),
  ),
  /** Entram nos critérios, mas não há como iniciar conversa (sem vínculo nem telefone). */
  semWhatsapp: z.array(
    z.object({
      clienteId: z.string().uuid(),
      clienteNome: z.string(),
      motivo: z.string(),
    }),
  ),
  resumo: z.object({
    candidatos: z.number().int(),
    horariosLivres: z.number().int(),
    /** O expediente usado: o cadastrado ou o informado na geração. */
    expediente: z.enum(["cadastro", "informado"]),
  }),
});
export type RoteiroPrevia = z.infer<typeof roteiroPreviaSchema>;

const motivoTexto = z
  .string()
  .trim()
  .min(5, "Informe o motivo (ao menos 5 caracteres)")
  .max(300);

/** Grava o roteiro que o vendedor revisou na prévia. */
export const roteiroGravarSchema = z.object({
  parametros: roteiroParametrosSchema,
  /** Vira a nota de cada conversa iniciada (visível a vendedor, supervisor e gerente). */
  textoNota: z.string().trim().min(3, "Informe o texto da nota").max(500),
  itens: z
    .array(
      z.object({
        clienteId: z.string().uuid(),
        quando: z.coerce.date(),
        motivos: z.array(roteiroMotivoSchema).default([]),
        detalhe: z.string().max(300).nullable().optional(),
      }),
    )
    .min(1, "Nenhum atendimento para gravar")
    .max(200),
});
export type RoteiroGravar = z.infer<typeof roteiroGravarSchema>;

/** Cancelar um ou vários itens: o motivo é obrigatório e a supervisão é avisada. */
export const roteiroCancelarSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(200),
  motivo: motivoTexto,
});
export type RoteiroCancelar = z.infer<typeof roteiroCancelarSchema>;

/** Remarcar um item para outro horário livre: o motivo é obrigatório. */
export const roteiroRemarcarSchema = z.object({
  quando: z.coerce.date(),
  motivo: motivoTexto,
});
export type RoteiroRemarcar = z.infer<typeof roteiroRemarcarSchema>;

export const ROTEIRO_ITEM_STATUS = [
  "agendado",
  "confirmado",
  "iniciado",
  "finalizado",
  "cancelado",
  "erro",
] as const;
export const roteiroItemStatusSchema = z.enum(ROTEIRO_ITEM_STATUS);
export type RoteiroItemStatus = z.infer<typeof roteiroItemStatusSchema>;

export const ROTEIRO_ITEM_STATUS_ROTULO: Record<RoteiroItemStatus, string> = {
  agendado: "Aguardando confirmação",
  confirmado: "Confirmado",
  iniciado: "Em atendimento",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
  erro: "Não iniciou",
};

/** Item de roteiro como a Agenda o mostra. */
export const roteiroItemSchema = z.object({
  id: z.string().uuid(),
  roteiroId: z.string().uuid(),
  atividadeId: z.string().uuid().nullable(),
  clienteId: z.string().uuid(),
  clienteNome: z.string(),
  conversaId: z.string().uuid().nullable(),
  quando: z.string().datetime(),
  status: roteiroItemStatusSchema,
  motivos: z.array(roteiroMotivoSchema),
  erro: z.string().nullable(),
  resultado: z.string().nullable(),
  motivoCancelamento: z.string().nullable(),
});
export type RoteiroItem = z.infer<typeof roteiroItemSchema>;

export const roteiroItensQuerySchema = z.object({
  de: dia,
  ate: dia,
});
export type RoteiroItensQuery = z.infer<typeof roteiroItensQuerySchema>;

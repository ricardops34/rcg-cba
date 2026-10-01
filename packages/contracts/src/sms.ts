import { z } from "zod";

/**
 * SMS pela iAgente (docs/planos/2026-10-01-sms-iagente.md). O destinatário é
 * sempre o celular do cadastro — não vem no corpo.
 */

export const enviarBoletoSmsSchema = z.object({
  atualizado: z
    .boolean()
    .default(true)
    .describe("Título vencido: valor e linha digitável com juros e multa (true) ou os originais"),
});
export type EnviarBoletoSms = z.infer<typeof enviarBoletoSmsSchema>;

/** Até dois segmentos de SMS, já contando o nome da empresa na frente. */
export const SMS_MENSAGEM_MAX = 280;

export const enviarSmsClienteSchema = z.object({
  mensagem: z
    .string()
    .trim()
    .min(1, "Escreva a mensagem")
    .max(SMS_MENSAGEM_MAX, `No máximo ${SMS_MENSAGEM_MAX} caracteres`)
    .describe("Texto do SMS; o nome da empresa vai na frente"),
});
export type EnviarSmsCliente = z.infer<typeof enviarSmsClienteSchema>;

export const envioSmsResultadoSchema = z.object({
  celular: z.string().describe("Celular do cadastro, no formato 55DDDNÚMERO"),
  mensagem: z.string().describe("O texto que saiu"),
});
export type EnvioSmsResultado = z.infer<typeof envioSmsResultadoSchema>;

export const ENVIO_SMS_RESULTADO_EXAMPLE: EnvioSmsResultado = {
  celular: "5567999990000",
  mensagem: "RCG DISTRIBUIDORA: boleto do titulo 117009 venc 08/10/2026 R$ 210,00.",
};

export const smsMotivoSchema = z.enum([
  "boleto",
  "cobranca",
  "mensagem_livre",
  "senha_provisoria",
  "aviso_antes_vencimento",
  "aviso_depois_vencimento",
]);
export type SmsMotivo = z.infer<typeof smsMotivoSchema>;

export const SMS_MOTIVO_ROTULO: Record<SmsMotivo, string> = {
  boleto: "Boleto",
  cobranca: "Cobrança",
  mensagem_livre: "Mensagem livre",
  senha_provisoria: "Senha provisória",
  aviso_antes_vencimento: "Lembrete de vencimento",
  aviso_depois_vencimento: "Aviso de atraso",
};

export const smsSituacaoSchema = z.enum(["entregue", "falha", "aguardando"]);
export type SmsSituacao = z.infer<typeof smsSituacaoSchema>;

/** Filtros da tela Administração > SMS: ano obrigatório, mês opcional. */
export const smsFiltroSchema = z.object({
  ano: z.coerce.number().int().min(2020).max(2100),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  motivo: smsMotivoSchema.optional(),
  situacao: smsSituacaoSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type SmsFiltro = z.infer<typeof smsFiltroSchema>;

export type SmsConfiguracao = {
  configurado: boolean;
  saldo: {
    modalidade: string | null;
    disponivel: number | null;
    limiteSeguranca: number | null;
    consumoMes: number | null;
  } | null;
  /** Motivo de não ter saldo quando há token (a iAgente recusou, fora do ar). */
  erroSaldo: string | null;
  webhookUrl: string;
  avisoVencimentoAtivo: boolean;
  avisoDiasAntes: number;
  avisoDiasDepois: number;
};

export type SmsEstatisticas = {
  total: number;
  entregue: number;
  falha: number;
  aguardando: number;
  respostas: number;
  porMotivo: Array<{ motivo: SmsMotivo; total: number }>;
  porMes: Array<{ mes: number; total: number }>;
};

export type SmsEnvioLinha = {
  id: string;
  createdAt: string;
  motivo: SmsMotivo;
  celular: string;
  mensagem: string;
  clienteId: string | null;
  clienteNome: string | null;
  status: string;
  situacao: SmsSituacao;
  statusEm: string | null;
  erro: string | null;
  respostas: Array<{ id: string; mensagem: string; recebidaEm: string }>;
};

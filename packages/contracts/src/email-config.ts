import { z } from "zod";

/**
 * Tela Administração > E-mail: os parâmetros SMTP_* e EMAIL_* da empresa
 * editados juntos, no mesmo desenho do SMS (decisão do usuário, 01/10/2026 —
 * sem tabela própria). A senha do SMTP nunca volta para a tela.
 */
export const emailConfiguracaoUpdateSchema = z.object({
  ativo: z.boolean().describe("EMAIL_ATIVO — habilita o envio de e-mail nesta empresa"),
  host: z.string().trim().max(120).describe("SMTP_HOST — vazio usa o servidor do ambiente"),
  porta: z.coerce.number().int().min(1).max(65535).nullable().describe("SMTP_PORTA"),
  seguro: z.boolean().describe("SMTP_SEGURO — SSL/TLS direto (porta 465)"),
  usuario: z.string().trim().max(120).describe("SMTP_USUARIO"),
  senha: z
    .string()
    .max(120)
    .optional()
    .describe("SMTP_SENHA — só quando for trocar; vazio mantém a atual"),
  remetente: z.string().trim().max(150).describe("SMTP_REMETENTE"),
  documentos: z.boolean().describe("EMAIL_DOCUMENTOS — DANFE e XML"),
  boleto: z.boolean().describe("EMAIL_BOLETO"),
  cobranca: z.boolean().describe("EMAIL_COBRANCA"),
  senhaProvisoria: z.boolean().describe("EMAIL_SENHA_PROVISORIA"),
});
export type EmailConfiguracaoUpdate = z.infer<typeof emailConfiguracaoUpdateSchema>;

export type EmailConfiguracao = Omit<EmailConfiguracaoUpdate, "senha"> & {
  senhaPreenchida: boolean;
  /** Sem SMTP_HOST da empresa, vale o servidor do ambiente (se houver). */
  usaServidorDoAmbiente: boolean;
  /** Há servidor para enviar: o da empresa ou o do ambiente. */
  smtpConfigurado: boolean;
  /** EMAIL_ATIVO e SMTP configurado. */
  habilitado: boolean;
};

/** O que a tela pode mostrar: cada botão de e-mail só aparece com o seu ligado. */
export type EmailDisponibilidade = {
  habilitado: boolean;
  documentos: boolean;
  boleto: boolean;
  cobranca: boolean;
  senhaProvisoria: boolean;
};

export type EmailTesteResultado = { enviadoPara: string };

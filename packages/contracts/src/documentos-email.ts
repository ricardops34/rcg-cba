import { z } from "zod";

/**
 * 2ª via e cobrança por e-mail
 * (docs/planos/2026-10-01-envio-email-documentos-cobranca.md).
 *
 * O destinatário não vem no corpo de propósito: é sempre o e-mail do cadastro
 * do cliente. Um campo livre transformaria a rota num envio de nota fiscal e
 * boleto para qualquer endereço.
 */

export const enviarNotaEmailSchema = z.object({
  incluirXml: z
    .boolean()
    .default(true)
    .describe("Anexa o XML da NF-e junto do DANFE"),
});
export type EnviarNotaEmail = z.infer<typeof enviarNotaEmailSchema>;

export const enviarBoletoEmailSchema = z.object({
  atualizado: z
    .boolean()
    .default(true)
    .describe("Título vencido: boleto com juros e multa (true) ou o original"),
});
export type EnviarBoletoEmail = z.infer<typeof enviarBoletoEmailSchema>;

export const envioEmailResultadoSchema = z.object({
  enviadoPara: z.array(z.string()).describe("E-mails do cadastro do cliente"),
  anexos: z.array(z.string()).describe("Arquivos que foram no e-mail"),
  avisos: z
    .array(z.string())
    .describe("O que não pôde ir (boleto sem 2ª via, nota sem XML...)"),
});
export type EnvioEmailResultado = z.infer<typeof envioEmailResultadoSchema>;

export const ENVIO_EMAIL_RESULTADO_EXAMPLE: EnvioEmailResultado = {
  enviadoPara: ["financeiro@cliente.com.br"],
  anexos: ["danfe-000117128.pdf", "boleto-117128A.pdf"],
  avisos: ["Título 053790/A: boleto indisponível — vencido além do prazo de reemissão"],
};

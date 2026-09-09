import { z } from "zod";

export const termoTipoSchema = z.enum(["termos_uso", "aviso_privacidade"]);
export type TermoTipo = z.infer<typeof termoTipoSchema>;

export const termoDocumentoSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string(),
  versao: z.string(),
  tipo: termoTipoSchema,
  titulo: z.string(),
  resumo: z.string(),
  conteudo: z.string(),
  conteudoHash: z.string().regex(/^[a-f0-9]{64}$/),
  vigenteEm: z.string().datetime(),
});
export type TermoDocumento = z.infer<typeof termoDocumentoSchema>;

export const termoAceiteResumoSchema = z.object({
  termoId: z.string().uuid(),
  codigo: z.string(),
  versao: z.string(),
  titulo: z.string(),
  aceitoEm: z.string().datetime(),
});
export type TermoAceiteResumo = z.infer<typeof termoAceiteResumoSchema>;

export const termosStatusSchema = z.object({
  possuiPendencia: z.boolean(),
  pendentes: z.array(termoDocumentoSchema),
  aceites: z.array(termoAceiteResumoSchema),
});
export type TermosStatus = z.infer<typeof termosStatusSchema>;

export const termoAceiteInputSchema = z.object({
  aceite: z.literal(true, {
    invalid_type_error: "É necessário confirmar a concordância com o documento",
  }),
  conteudoHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type TermoAceiteInput = z.infer<typeof termoAceiteInputSchema>;

export const termoAceiteResultSchema = z.object({
  aceito: z.literal(true),
  termoId: z.string().uuid(),
  aceitoEm: z.string().datetime(),
});
export type TermoAceiteResult = z.infer<typeof termoAceiteResultSchema>;

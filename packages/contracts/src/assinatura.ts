import { z } from "zod";

export const situacaoAssinaturaSchema = z.enum([
  "ativa",
  "teste",
  "atrasada",
  "suspensa",
  "cancelada",
]);
export type SituacaoAssinatura = z.infer<typeof situacaoAssinaturaSchema>;

export const cicloPagamentoSchema = z.enum([
  "mensal",
  "trimestral",
  "semestral",
  "anual",
]);
export type CicloPagamento = z.infer<typeof cicloPagamentoSchema>;

export const assinaturaSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  planoId: z.string().uuid(),
  situacao: situacaoAssinaturaSchema,
  ciclo: cicloPagamentoSchema,
  valorMensalidade: z.number().min(0),
  diaVencimento: z.number().int().min(1).max(31),
  inicioEm: z.string(),
  proximoVencimentoEm: z.string().nullable().optional(),
  canceladaEm: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  plano: z
    .object({
      id: z.string().uuid(),
      nome: z.string(),
      codigo: z.string(),
    })
    .optional(),
});
export type Assinatura = z.infer<typeof assinaturaSchema>;

export const assinaturaUpdateSchema = z.object({
  planoId: z.string().uuid().optional(),
  situacao: situacaoAssinaturaSchema.optional(),
  ciclo: cicloPagamentoSchema.optional(),
  valorMensalidade: z.coerce.number().min(0).optional(),
  diaVencimento: z.coerce.number().int().min(1).max(31).optional(),
  observacoes: z.string().optional().nullable(),
});
export type AssinaturaUpdate = z.infer<typeof assinaturaUpdateSchema>;

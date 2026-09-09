import { z } from "zod";

export const tourCodigoSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/);

export const tourOrigemSchema = z.enum(["automatico", "manual"]);
export type TourOrigem = z.infer<typeof tourOrigemSchema>;
export const tourStatusSchema = z.enum([
  "em_andamento",
  "concluido",
  "dispensado",
]);
export type TourStatus = z.infer<typeof tourStatusSchema>;

export const tourExecucaoSchema = z.object({
  id: z.string().uuid(),
  tourCodigo: tourCodigoSchema,
  versao: z.number().int().positive(),
  origem: tourOrigemSchema,
  status: tourStatusSchema,
  passoAtual: z.number().int().nonnegative(),
  iniciadoEm: z.string().datetime(),
  finalizadoEm: z.string().datetime().nullable(),
});
export type TourExecucao = z.infer<typeof tourExecucaoSchema>;

export const tourEstadoSchema = z.object({
  deveIniciarAutomaticamente: z.boolean(),
  ultimaExecucao: tourExecucaoSchema.nullable(),
});
export type TourEstado = z.infer<typeof tourEstadoSchema>;

export const iniciarTourInputSchema = z.object({
  versao: z.number().int().positive(),
  origem: tourOrigemSchema,
});
export type IniciarTourInput = z.infer<typeof iniciarTourInputSchema>;

export const atualizarTourInputSchema = z.object({
  passoAtual: z.number().int().nonnegative(),
  status: tourStatusSchema,
});
export type AtualizarTourInput = z.infer<typeof atualizarTourInputSchema>;

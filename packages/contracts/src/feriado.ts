import { z } from "zod";

/**
 * Feriado da empresa. É por empresa, e não da plataforma, porque os
 * municipais mudam de uma cidade para outra (RCG e Cuiabá, por exemplo).
 *
 * Quem usa: a trava de horário de trabalho — no feriado, o usuário com
 * "restringir horário" no cadastro não acessa o sistema.
 */

export const origemFeriadoSchema = z
  .enum(["nacional_fixo", "nacional_movel", "manual"])
  .describe("nacional_fixo/nacional_movel = gerado pelo sistema; manual = cadastrado pela empresa");
export type OrigemFeriado = z.infer<typeof origemFeriadoSchema>;

export const ORIGEM_FERIADO_LABEL: Record<OrigemFeriado, string> = {
  nacional_fixo: "Nacional",
  nacional_movel: "Nacional (móvel)",
  manual: "Cadastrado pela empresa",
};

// Data de calendário, sem hora nem fuso: o feriado é o dia inteiro.
const dataFeriado = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data")
  .describe("Dia do feriado (AAAA-MM-DD)");

export const feriadoSchema = z.object({
  id: z.string(),
  empresaId: z.string(),
  data: dataFeriado,
  descricao: z.string(),
  origem: origemFeriadoSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Feriado = z.infer<typeof feriadoSchema>;

export const feriadoCreateSchema = z.object({
  data: dataFeriado,
  descricao: z
    .string()
    .trim()
    .min(1, "Informe a descrição")
    .max(120)
    .describe('Como o feriado aparece (ex.: "Aniversário de Campo Grande")'),
});
export type FeriadoCreate = z.infer<typeof feriadoCreateSchema>;

export const feriadoUpdateSchema = feriadoCreateSchema.partial();
export type FeriadoUpdate = z.infer<typeof feriadoUpdateSchema>;

export const feriadoQuerySchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2100).optional().describe("Ano dos feriados (padrão: ano atual)"),
});
export type FeriadoQuery = z.infer<typeof feriadoQuerySchema>;

export const feriadoGerarNacionaisSchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2100).describe("Ano para gerar os feriados nacionais"),
});
export type FeriadoGerarNacionais = z.infer<typeof feriadoGerarNacionaisSchema>;

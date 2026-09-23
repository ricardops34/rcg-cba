import { z } from "zod";
import { auditFieldsSchema } from "./common";

export const planoCreateSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do plano").max(100),
  codigo: z.string().trim().min(1, "Informe o código").max(50),
  descricao: z.string().trim().max(500).optional().nullable(),
  valorMensal: z.coerce.number().min(0, "Valor inválido"),
  valorTrimestral: z.coerce.number().min(0, "Valor inválido").default(0),
  valorSemestral: z.coerce.number().min(0, "Valor inválido").default(0),
  valorAnual: z.coerce.number().min(0, "Valor inválido").default(0),
  limiteUsuarios: z.coerce.number().int().min(1).optional().nullable(),
  ativo: z.boolean().default(true),
  moduloIds: z.array(z.string().uuid()).default([]),
  menuIds: z.array(z.string().uuid()).default([]),
  rotinaIds: z.array(z.string().uuid()).default([]),
});
export type PlanoCreate = z.infer<typeof planoCreateSchema>;

export const planoUpdateSchema = planoCreateSchema.partial();
export type PlanoUpdate = z.infer<typeof planoUpdateSchema>;

export const planoSchema = planoCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type Plano = z.infer<typeof planoSchema>;

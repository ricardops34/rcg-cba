import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const paisCreateSchema = z.object({
  codigoErp: opt(10),
  nome: z.string().trim().min(1, "Informe o nome").max(100),
  sigla: opt(4),
  comexId: opt(10),
  ativo: z.boolean().default(true),
});
export type PaisCreate = z.infer<typeof paisCreateSchema>;

export const paisUpdateSchema = paisCreateSchema.partial();
export type PaisUpdate = z.infer<typeof paisUpdateSchema>;

export const paisSchema = paisCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type Pais = z.infer<typeof paisSchema>;

export const paisQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type PaisQuery = z.infer<typeof paisQuerySchema>;

export const PAIS_EXAMPLE: Pais = {
  id: "6f7a8b9c-0d1e-4f2a-3b4c-5d6e7f8091a2",
  codigoErp: "1058",
  nome: "BRASIL",
  sigla: "BR",
  comexId: "105",
  ativo: true,
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const PAIS_CREATE_EXAMPLE: PaisCreate = {
  codigoErp: "1058",
  nome: "BRASIL",
  sigla: "BR",
  comexId: "105",
  ativo: true,
};

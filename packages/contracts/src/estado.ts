import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const estadoCreateSchema = z.object({
  codigoErp: opt(10),
  sigla: z.string().trim().min(2, "Informe a sigla").max(2),
  descricao: z.string().trim().min(1, "Informe a descrição").max(100),
  codigoIbge: opt(10),
  ativo: z.boolean().default(true),
});
export type EstadoCreate = z.infer<typeof estadoCreateSchema>;

export const estadoUpdateSchema = estadoCreateSchema.partial();
export type EstadoUpdate = z.infer<typeof estadoUpdateSchema>;

export const estadoSchema = estadoCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type Estado = z.infer<typeof estadoSchema>;

export const estadoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type EstadoQuery = z.infer<typeof estadoQuerySchema>;

export const ESTADO_EXAMPLE: Estado = {
  id: "3c4d5e6f-7a8b-4c9d-0e1f-2a3b4c5d6e7f",
  codigoErp: "12",
  sigla: "MS",
  descricao: "MATO GROSSO DO SUL",
  codigoIbge: "50",
  ativo: true,
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const ESTADO_CREATE_EXAMPLE: EstadoCreate = {
  codigoErp: "12",
  sigla: "MS",
  descricao: "MATO GROSSO DO SUL",
  codigoIbge: "50",
  ativo: true,
};

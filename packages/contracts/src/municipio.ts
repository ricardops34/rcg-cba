import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const municipioCreateSchema = z.object({
  codigoErp: opt(10),
  descricao: z.string().trim().min(1, "Informe a descrição").max(200),
  estadoId: z.string().uuid().nullable().optional(),
  codigoIbge: opt(10),
  ativo: z.boolean().default(true),
});
export type MunicipioCreate = z.infer<typeof municipioCreateSchema>;

export const municipioUpdateSchema = municipioCreateSchema.partial();
export type MunicipioUpdate = z.infer<typeof municipioUpdateSchema>;

export const municipioSchema = municipioCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type Municipio = z.infer<typeof municipioSchema>;

export const municipioQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  estadoId: z.string().uuid().optional(),
});
export type MunicipioQuery = z.infer<typeof municipioQuerySchema>;

export const MUNICIPIO_EXAMPLE: Municipio = {
  id: "4d5e6f7a-8b9c-4d0e-1f2a-3b4c5d6e7f80",
  codigoErp: "0027",
  descricao: "CAMPO GRANDE",
  estadoId: "3c4d5e6f-7a8b-4c9d-0e1f-2a3b4c5d6e7f",
  codigoIbge: "5002704",
  ativo: true,
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const MUNICIPIO_CREATE_EXAMPLE: MunicipioCreate = {
  codigoErp: "0027",
  descricao: "CAMPO GRANDE",
  estadoId: null,
  codigoIbge: "5002704",
  ativo: true,
};

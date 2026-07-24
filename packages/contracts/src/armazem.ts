import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

export const armazemCreateSchema = z.object({
  codigoErp: z.string().trim().min(1, "Informe o código ERP").max(10),
  descricao: z.string().trim().min(1, "Informe a descrição").max(50),
  ativo: z.boolean().default(true),
});
export type ArmazemCreate = z.infer<typeof armazemCreateSchema>;

export const armazemUpdateSchema = armazemCreateSchema.partial();
export type ArmazemUpdate = z.infer<typeof armazemUpdateSchema>;

export const armazemSchema = armazemCreateSchema.extend({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type Armazem = z.infer<typeof armazemSchema>;

export const armazemQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type ArmazemQuery = z.infer<typeof armazemQuerySchema>;

export const ARMAZEM_EXAMPLE: Armazem = {
  id: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  codigoErp: "001",
  descricao: "ARMAZÉM CENTRAL",
  ativo: true,
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const ARMAZEM_CREATE_EXAMPLE: ArmazemCreate = {
  codigoErp: "001",
  descricao: "ARMAZÉM CENTRAL",
  ativo: true,
};

import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const cnaeCreateSchema = z.object({
  codigoErp: opt(10),
  secao: opt(1),
  divisao: opt(10),
  grupo: opt(10),
  classe: opt(10),
  subclasse: opt(10),
  descricao: z.string().trim().min(1, "Informe a descrição").max(500),
  ativo: z.boolean().default(true),
});
export type CnaeCreate = z.infer<typeof cnaeCreateSchema>;

export const cnaeUpdateSchema = cnaeCreateSchema.partial();
export type CnaeUpdate = z.infer<typeof cnaeUpdateSchema>;

export const cnaeSchema = cnaeCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type Cnae = z.infer<typeof cnaeSchema>;

export const cnaeQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type CnaeQuery = z.infer<typeof cnaeQuerySchema>;

export const CNAE_EXAMPLE: Cnae = {
  id: "7a8b9c0d-1e2f-4a3b-4c5d-6e7f8091a2b3",
  codigoErp: "4639701",
  secao: "G",
  divisao: "46",
  grupo: "463",
  classe: "4639-7",
  subclasse: "4639-7/01",
  descricao: "Comércio atacadista de produtos alimentícios em geral",
  ativo: true,
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const CNAE_CREATE_EXAMPLE: CnaeCreate = {
  codigoErp: "4639701",
  secao: "G",
  divisao: "46",
  grupo: "463",
  classe: "4639-7",
  subclasse: "4639-7/01",
  descricao: "Comércio atacadista de produtos alimentícios em geral",
  ativo: true,
};

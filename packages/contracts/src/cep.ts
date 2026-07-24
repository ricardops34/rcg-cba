import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const cepCreateSchema = z.object({
  cep: z.string().trim().min(8, "Informe o CEP").max(9),
  estadoId: z.string().uuid().nullable().optional(),
  municipioId: z.string().uuid().nullable().optional(),
  bairro: opt(200),
  endereco: opt(200),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  ativo: z.boolean().default(true),
});
export type CepCreate = z.infer<typeof cepCreateSchema>;

export const cepUpdateSchema = cepCreateSchema.partial();
export type CepUpdate = z.infer<typeof cepUpdateSchema>;

// `origem` (serviço que resolveu a consulta no legado) é só leitura —
// preenchida pelo import, não pelo formulário.
export const cepSchema = cepCreateSchema.extend({
  id: z.string().uuid(),
  origem: z.string().nullable(),
  ...auditFieldsSchema.shape,
});
export type Cep = z.infer<typeof cepSchema>;

export const cepQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  estadoId: z.string().uuid().optional(),
  municipioId: z.string().uuid().optional(),
});
export type CepQuery = z.infer<typeof cepQuerySchema>;

export const CEP_EXAMPLE: Cep = {
  id: "5e6f7a8b-9c0d-4e1f-2a3b-4c5d6e7f8091",
  cep: "79002201",
  estadoId: "3c4d5e6f-7a8b-4c9d-0e1f-2a3b4c5d6e7f",
  municipioId: "4d5e6f7a-8b9c-4d0e-1f2a-3b4c5d6e7f80",
  bairro: "CENTRO",
  endereco: "RUA MARECHAL RONDON",
  latitude: -20.4649,
  longitude: -54.6218,
  origem: "correios",
  ativo: true,
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const CEP_CREATE_EXAMPLE: CepCreate = {
  cep: "79002201",
  estadoId: null,
  municipioId: null,
  bairro: "CENTRO",
  endereco: "RUA MARECHAL RONDON",
  latitude: null,
  longitude: null,
  ativo: true,
};

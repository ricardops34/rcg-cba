import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";
import { regraDescontoVinculoFields } from "./regra-desconto";

// Somente consulta: categorias/subcategorias entram pelo import (e no futuro
// pela API externa de manutenção), não por esta API.
export const categoriaSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  codigoErp: z.string(),
  descricao: z.string(),
  categoriaPaiId: z.string().uuid().nullable(),
  usado: z.boolean().nullable(),
  ativo: z.boolean(),
  ...regraDescontoVinculoFields,
  ...auditFieldsSchema.shape,
});
export type Categoria = z.infer<typeof categoriaSchema>;

// raiz=true filtra só categorias de nível raiz (sem categoria pai).
export const categoriaQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  usado: booleanQueryParam,
  raiz: booleanQueryParam,
  categoriaPaiId: z.string().uuid().optional(),
});
export type CategoriaQuery = z.infer<typeof categoriaQuerySchema>;

export const CATEGORIA_EXAMPLE: Categoria = {
  id: "9e8d7c6b-5a49-4382-b1c0-d9e8f7a6b5c4",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  codigoErp: "000004",
  descricao: "COZINHA",
  categoriaPaiId: null,
  usado: true,
  ativo: true,
  regraDescontoId: null,
  regraDesconto: null,
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

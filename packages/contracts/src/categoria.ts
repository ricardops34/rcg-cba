import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

export const categoriaCreateSchema = z.object({
  codigoErp: z.string().trim().min(1, "Informe o código ERP").max(10),
  descricao: z.string().trim().min(1, "Informe a descrição").max(200),
  categoriaPaiId: z.string().uuid().nullable().optional(),
  usado: z.boolean().nullable().optional(),
  ativo: z.boolean().default(true),
});
export type CategoriaCreate = z.infer<typeof categoriaCreateSchema>;

export const categoriaUpdateSchema = categoriaCreateSchema.partial();
export type CategoriaUpdate = z.infer<typeof categoriaUpdateSchema>;

export const categoriaSchema = categoriaCreateSchema.extend({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
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
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const CATEGORIA_CREATE_EXAMPLE: CategoriaCreate = {
  codigoErp: "000004",
  descricao: "COZINHA",
  categoriaPaiId: null,
  usado: true,
  ativo: true,
};

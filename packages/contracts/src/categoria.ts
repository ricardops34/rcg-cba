import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";
import { regraDescontoVinculoFields } from "./regra-desconto";

// Cadastro vem do import (e no futuro da API externa de manutenção): esta API
// não cria nem exclui categoria. A exceção é `usado`, que é marcação da
// plataforma e se edita por aqui — ver `categoriaUpdateSchema`.
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

// raiz=true traz só categoria (nível raiz); raiz=false, só subcategoria;
// omitido, as duas.
export const categoriaQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  usado: booleanQueryParam,
  raiz: booleanQueryParam,
  categoriaPaiId: z.string().uuid().optional(),
});
export type CategoriaQuery = z.infer<typeof categoriaQuerySchema>;

/**
 * O único campo editável por esta API.
 *
 * `usado` marca as categorias que a empresa acompanha — é o que o Dashboard
 * Comercial usa para escolher o que entra na tabela de Vendas por Categoria.
 * Vale só para categoria raiz: subcategoria não tem a marcação (nasce nula no
 * import) e não aparece no dashboard.
 */
export const categoriaUpdateSchema = z.object({
  usado: z.boolean().nullable(),
});
export type CategoriaUpdate = z.infer<typeof categoriaUpdateSchema>;

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

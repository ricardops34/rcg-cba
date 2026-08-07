import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";
import { regraDescontoVinculoSchema } from "./regra-desconto";

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const produtoCreateSchema = z.object({
  codigoErp: z.string().trim().min(1, "Informe o código ERP").max(30),
  descricao: z.string().trim().min(1, "Informe a descrição").max(120),
  unidade: opt(4),
  categoriaId: z.string().uuid().nullable().optional(),
  subCategoriaId: z.string().uuid().nullable().optional(),
  armazemId: z.string().uuid().nullable().optional(),
  marca: opt(40),
  codigoBarras: opt(30),
  ncm: opt(20),
  qtdEmbalagem: z.coerce.number().min(0).nullable().optional(),
  peso: z.coerce.number().min(0).nullable().optional(),
  ultimoPreco: z.coerce.number().min(0).nullable().optional(),
  observacao: opt(500),
  ativo: z.boolean().default(true),
});
export type ProdutoCreate = z.infer<typeof produtoCreateSchema>;

export const produtoUpdateSchema = produtoCreateSchema.partial();
export type ProdutoUpdate = z.infer<typeof produtoUpdateSchema>;

export const produtoSchema = produtoCreateSchema.extend({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  // Regra de desconto (SZ0): leitura apenas — quem mantém é o ERP, pela API
  // de integração; nem a tela nem o CRUD interno gravam este vínculo.
  regraDescontoId: z.string().uuid().nullable().optional(),
  regraDesconto: regraDescontoVinculoSchema.nullable().optional(),
  ...auditFieldsSchema.shape,
});
export type Produto = z.infer<typeof produtoSchema>;

export const produtoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  regraDescontoId: z.string().uuid().optional(),
  categoriaId: z.string().uuid().optional(),
  subCategoriaId: z.string().uuid().optional(),
  armazemId: z.string().uuid().optional(),
});
export type ProdutoQuery = z.infer<typeof produtoQuerySchema>;

export const PRODUTO_EXAMPLE: Produto = {
  id: "c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  codigoErp: "11400443",
  descricao: "DETERGENTE NEUTRO 5L",
  unidade: "GL",
  categoriaId: "9e8d7c6b-5a49-4382-b1c0-d9e8f7a6b5c4",
  subCategoriaId: null,
  armazemId: null,
  marca: "AUDAX",
  codigoBarras: "7898920071234",
  ncm: "34022000",
  qtdEmbalagem: 4,
  peso: 5.2,
  ultimoPreco: 28.9,
  observacao: "",
  ativo: true,
  regraDescontoId: null,
  regraDesconto: null,
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const PRODUTO_CREATE_EXAMPLE: ProdutoCreate = {
  codigoErp: "11400443",
  descricao: "DETERGENTE NEUTRO 5L",
  unidade: "GL",
  categoriaId: null,
  subCategoriaId: null,
  armazemId: null,
  marca: "AUDAX",
  codigoBarras: "7898920071234",
  ncm: "34022000",
  qtdEmbalagem: 4,
  peso: 5.2,
  ultimoPreco: 28.9,
  observacao: "",
  ativo: true,
};

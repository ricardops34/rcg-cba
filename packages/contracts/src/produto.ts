import { z } from "zod";
import { auditFieldsSchema } from "./common";

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const produtoCreateSchema = z.object({
  codigoErp: z.string().trim().min(1, "Informe o código ERP").max(30),
  descricao: z.string().trim().min(1, "Informe a descrição").max(120),
  unidade: opt(4),
  categoria: opt(60),
  subCategoria: opt(60),
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
  ...auditFieldsSchema.shape,
});
export type Produto = z.infer<typeof produtoSchema>;

export const PRODUTO_CREATE_EXAMPLE: ProdutoCreate = {
  codigoErp: "11400443",
  descricao: "DETERGENTE NEUTRO 5L",
  unidade: "GL",
  categoria: "COZINHA",
  subCategoria: "",
  marca: "AUDAX",
  codigoBarras: "7898920071234",
  ncm: "34022000",
  qtdEmbalagem: 4,
  peso: 5.2,
  ultimoPreco: 28.9,
  observacao: "",
  ativo: true,
};

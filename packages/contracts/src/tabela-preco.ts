import { z } from "zod";
import { regraDescontoVinculoFields } from "./regra-desconto";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

// Somente consulta: tabelas de preço e itens entram pelo import (e no futuro
// pela API externa de manutenção), não por esta API.
export const tabelaPrecoSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  codigoErp: z.string(),
  descricao: z.string(),
  dtInicio: z.string().datetime().nullable(),
  dtFim: z.string().datetime().nullable(),
  ativo: z.boolean(),
  ...auditFieldsSchema.shape,
});
export type TabelaPreco = z.infer<typeof tabelaPrecoSchema>;

export const tabelaPrecoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type TabelaPrecoQuery = z.infer<typeof tabelaPrecoQuerySchema>;

export const TABELA_PRECO_EXAMPLE: TabelaPreco = {
  id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  codigoErp: "001",
  descricao: "TABELA PADRAO",
  dtInicio: "2019-07-11T00:00:00.000Z",
  dtFim: null,
  ativo: true,
  createdAt: "2026-07-31T12:00:00.000Z",
  updatedAt: "2026-07-31T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

// ------------------------------------------------------------------
// Itens (produto + preço) de uma tabela de preço
// ------------------------------------------------------------------

const tabelaPrecoItemProdutoSchema = z.object({
  id: z.string().uuid(),
  codigoErp: z.string(),
  descricao: z.string(),
  unidade: z.string().nullable(),
});

export const tabelaPrecoItemSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  tabelaPrecoId: z.string().uuid(),
  produtoId: z.string().uuid(),
  preco: z.number(),
  ativo: z.boolean(),
  produto: tabelaPrecoItemProdutoSchema,
  ...regraDescontoVinculoFields,
  ...auditFieldsSchema.shape,
});
export type TabelaPrecoItem = z.infer<typeof tabelaPrecoItemSchema>;

export const tabelaPrecoItemQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type TabelaPrecoItemQuery = z.infer<typeof tabelaPrecoItemQuerySchema>;

export const TABELA_PRECO_ITEM_EXAMPLE: TabelaPrecoItem = {
  id: "0d1e2f3a-4b5c-4d6e-7f80-91a2b3c4d5e6",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  tabelaPrecoId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  produtoId: "c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  preco: 735.3,
  ativo: true,
  produto: {
    id: "c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    codigoErp: "11400443",
    descricao: "DETERGENTE NEUTRO 5L",
    unidade: "GL",
  },
  createdAt: "2026-07-31T12:00:00.000Z",
  updatedAt: "2026-07-31T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

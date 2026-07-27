import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

// Espelho read-only do ERP: sem create/update — os dados entram só pelo
// import (e no futuro pela API externa de manutenção).
export const estoqueSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  produtoId: z.string().uuid(),
  armazemId: z.string().uuid(),
  saldo: z.number(),
  reserva: z.number().nullable(),
  custo: z.number().nullable(),
  ultimoPreco: z.number().nullable(),
  ultimaCompra: z.string().datetime().nullable(),
  ...auditFieldsSchema.shape,
});
export type Estoque = z.infer<typeof estoqueSchema>;

export const estoqueQuerySchema = paginationQuerySchema.extend({
  armazemId: z.string().uuid().optional(),
  comSaldo: booleanQueryParam,
});
export type EstoqueQuery = z.infer<typeof estoqueQuerySchema>;

const categoriaRefSchema = z.object({ id: z.string().uuid(), descricao: z.string() }).nullable();

// Linha da listagem: um produto, com o saldo somado em todos os armazéns
// (ou só no armazém filtrado, quando informado em armazemId).
export const estoqueProdutoResumoSchema = z.object({
  id: z.string().uuid(),
  codigoErp: z.string(),
  descricao: z.string(),
  unidade: z.string().nullable(),
  categoria: categoriaRefSchema,
  saldoTotal: z.number(),
  reservaTotal: z.number().nullable(),
  qtdArmazens: z.number().int(),
  ultimaCompra: z.string().datetime().nullable(),
});
export type EstoqueProdutoResumo = z.infer<typeof estoqueProdutoResumoSchema>;

// Detalhe: saldo do produto aberto por armazém.
export const estoqueSaldoArmazemSchema = estoqueSchema.omit({ produtoId: true }).extend({
  armazem: z.object({ id: z.string().uuid(), codigoErp: z.string().nullable(), descricao: z.string() }),
});
export type EstoqueSaldoArmazem = z.infer<typeof estoqueSaldoArmazemSchema>;

export const estoqueDetalheSchema = z.object({
  produto: z.object({
    id: z.string().uuid(),
    codigoErp: z.string(),
    descricao: z.string(),
    unidade: z.string().nullable(),
    categoria: categoriaRefSchema,
  }),
  saldos: z.array(estoqueSaldoArmazemSchema),
});
export type EstoqueDetalhe = z.infer<typeof estoqueDetalheSchema>;

export const ESTOQUE_EXAMPLE: Estoque = {
  id: "8b9c0d1e-2f3a-4b4c-5d6e-7f8091a2b3c4",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  produtoId: "c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  armazemId: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
  saldo: 128,
  reserva: 12,
  custo: 21.4,
  ultimoPreco: 28.9,
  ultimaCompra: "2026-06-18T00:00:00.000Z",
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

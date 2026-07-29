import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

// Linha de meta por categoria — input de create/update (o server substitui o
// conjunto inteiro de linhas a cada save, sem endpoint por linha).
export const objetivoVendedorCategoriaLinhaSchema = z.object({
  categoriaId: z.string().uuid(),
  valor: z.coerce.number().min(0),
});
export type ObjetivoVendedorCategoriaLinha = z.infer<typeof objetivoVendedorCategoriaLinhaSchema>;

export const objetivoVendedorMesCreateSchema = z.object({
  vendedorId: z.string().uuid(),
  mes: z.coerce.number().int().min(1).max(12),
  ano: z.coerce.number().int().min(2000).max(2100),
  valor: z.coerce.number().min(0).default(0),
  numeroCliente: z.coerce.number().min(0).nullable().optional(),
  novoCliente: z.coerce.number().min(0).nullable().optional(),
  tipo: z.string().trim().max(1).optional().or(z.literal("")),
  ativo: z.boolean().default(true),
  categorias: z.array(objetivoVendedorCategoriaLinhaSchema).default([]),
});
export type ObjetivoVendedorMesCreate = z.infer<typeof objetivoVendedorMesCreateSchema>;

export const objetivoVendedorMesUpdateSchema = objetivoVendedorMesCreateSchema.partial();
export type ObjetivoVendedorMesUpdate = z.infer<typeof objetivoVendedorMesUpdateSchema>;

// Linha de meta por categoria — leitura, com a categoria embutida (evita um
// segundo fetch no form/tabela).
export const objetivoVendedorCategoriaSchema = z.object({
  id: z.string().uuid(),
  categoriaId: z.string().uuid(),
  valor: z.number(),
  categoria: z.object({
    codigoErp: z.string(),
    descricao: z.string(),
  }),
});
export type ObjetivoVendedorCategoria = z.infer<typeof objetivoVendedorCategoriaSchema>;

export const objetivoVendedorMesSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  vendedorId: z.string().uuid(),
  mes: z.number().int(),
  ano: z.number().int(),
  valor: z.number(),
  numeroCliente: z.number().nullable(),
  novoCliente: z.number().nullable(),
  tipo: z.string().nullable(),
  ativo: z.boolean(),
  vendedor: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    nomeReduzido: z.string().nullable(),
  }),
  categorias: z.array(objetivoVendedorCategoriaSchema),
  ...auditFieldsSchema.shape,
});
export type ObjetivoVendedorMes = z.infer<typeof objetivoVendedorMesSchema>;

export const objetivoVendedorMesQuerySchema = paginationQuerySchema.extend({
  ano: z.coerce.number().int().optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  vendedorId: z.string().uuid().optional(),
  ativo: booleanQueryParam,
});
export type ObjetivoVendedorMesQuery = z.infer<typeof objetivoVendedorMesQuerySchema>;

export const OBJETIVO_VENDEDOR_MES_EXAMPLE: ObjetivoVendedorMes = {
  id: "a1b2c3d4-5e6f-4708-9a0b-1c2d3e4f5a6b",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  vendedorId: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
  mes: 7,
  ano: 2026,
  valor: 85600,
  numeroCliente: 85,
  novoCliente: null,
  tipo: null,
  ativo: true,
  vendedor: { id: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10", nome: "CARLOS SILVA", nomeReduzido: "CARLOS" },
  categorias: [
    {
      id: "c1d2e3f4-5a6b-4708-9a0b-1c2d3e4f5a6c",
      categoriaId: "9e8d7c6b-5a49-4382-b1c0-d9e8f7a6b5c4",
      valor: 13805.34,
      categoria: { codigoErp: "02", descricao: "COZINHA" },
    },
  ],
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const OBJETIVO_VENDEDOR_MES_CREATE_EXAMPLE: ObjetivoVendedorMesCreate = {
  vendedorId: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
  mes: 7,
  ano: 2026,
  valor: 85600,
  numeroCliente: 85,
  novoCliente: null,
  tipo: "",
  ativo: true,
  categorias: [{ categoriaId: "9e8d7c6b-5a49-4382-b1c0-d9e8f7a6b5c4", valor: 13805.34 }],
};

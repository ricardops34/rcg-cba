import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

// Espelho read-only da SF1, irmão de `nota-saida.ts`: sem create/update — as
// notas entram só pela API de integração.
//
// `tipo` separa dois documentos diferentes: 'N' é compra, e o participante é o
// fornecedor; 'D' é devolução de venda, e o participante é o cliente. Daí as
// duas chaves nulas — só uma delas vem preenchida.
//
// Sem os campos de NF-e da saída (`situacaoNfe`, `protocoloNfe`, `temXml`): o
// documento de entrada foi emitido por terceiro, e a plataforma não reimprime
// segunda via dele.

export const notaEntradaSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  codigoErp: z.string().nullable(),
  fornecedorId: z.string().uuid().nullable(),
  clienteId: z.string().uuid().nullable(),
  condicaoPagamentoId: z.string().uuid().nullable(),

  numero: z.string(),
  serie: z.string().nullable(),
  especieFiscal: z.string().nullable(),
  tipo: z.string().nullable(),
  // Emissão é a data do documento do fornecedor; entrada é o recebimento da
  // mercadoria. `ano`/`mes` derivam da emissão, para casar com a apuração de
  // venda, que também usa emissão.
  dtEmissao: z.string().datetime().nullable(),
  dtEntrada: z.string().datetime().nullable(),
  ano: z.number().int().nullable(),
  mes: z.number().int().nullable(),

  vlrBruto: z.number(),
  vlrMercadoria: z.number(),
  vlrItens: z.number(),
  vlrDesconto: z.number(),
  vlrIcms: z.number(),
  vlrIcmsSt: z.number(),
  vlrIpi: z.number(),
  vlrFrete: z.number(),
  vlrSeguro: z.number(),
  vlrDespesa: z.number(),

  chaveNfe: z.string().nullable(),
  dtNfe: z.string().datetime().nullable(),
  mensagem: z.string().nullable(),
  ativo: z.boolean(),

  ...auditFieldsSchema.shape,
});
export type NotaEntrada = z.infer<typeof notaEntradaSchema>;

export const notaEntradaQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  fornecedorId: z.string().uuid().optional(),
  clienteId: z.string().uuid().optional(),
  // 'N' compra, 'D' devolução de venda.
  tipo: z.string().trim().max(10).optional(),
  ano: z.coerce.number().int().optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
});
export type NotaEntradaQuery = z.infer<typeof notaEntradaQuerySchema>;

export const notaEntradaItemSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  notaEntradaId: z.string().uuid(),
  codigoErp: z.string().nullable(),
  fornecedorId: z.string().uuid().nullable(),
  clienteId: z.string().uuid().nullable(),
  produtoId: z.string().uuid().nullable(),
  armazemId: z.string().uuid().nullable(),

  item: z.number().int().nullable(),
  dtEmissao: z.string().datetime().nullable(),
  ano: z.number().int().nullable(),
  mes: z.number().int().nullable(),
  cfop: z.string().nullable(),

  quantidade: z.number(),
  vlrUnitario: z.number(),
  vlrDesconto: z.number(),
  vlrTotal: z.number(),
  vlrIcms: z.number(),
  vlrIcmsSt: z.number(),
  vlrIpi: z.number(),

  peso: z.number().nullable(),
  ativo: z.boolean(),

  ...auditFieldsSchema.shape,
});
export type NotaEntradaItem = z.infer<typeof notaEntradaItemSchema>;

export const NOTA_ENTRADA_EXAMPLE: NotaEntrada = {
  id: "5e6f7a8b-9c0d-4e1f-a203-4b5c6d7e8f90",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  codigoErp: "01-000004212-1-000042-01-N",
  fornecedorId: "4f8a1b2c-3d4e-4f50-a617-28394a5b6c7d",
  clienteId: null,
  condicaoPagamentoId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  numero: "000004212",
  serie: "1",
  especieFiscal: "SPED",
  tipo: "N",
  dtEmissao: "2026-08-28T00:00:00.000Z",
  dtEntrada: "2026-09-01T00:00:00.000Z",
  ano: 2026,
  mes: 8,
  vlrBruto: 8420.75,
  vlrMercadoria: 7900,
  vlrItens: 7900,
  vlrDesconto: 0,
  vlrIcms: 1343,
  vlrIcmsSt: 210.75,
  vlrIpi: 0,
  vlrFrete: 310,
  vlrSeguro: 0,
  vlrDespesa: 0,
  chaveNfe: "50260800000000000191550010000042121000042120",
  dtNfe: "2026-08-28T00:00:00.000Z",
  mensagem: null,
  ativo: true,
  createdAt: "2026-09-08T12:00:00.000Z",
  updatedAt: "2026-09-08T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const NOTA_ENTRADA_ITEM_EXAMPLE: NotaEntradaItem = {
  id: "6f7a8b9c-0d1e-4f20-b314-5c6d7e8f9012",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  notaEntradaId: "5e6f7a8b-9c0d-4e1f-a203-4b5c6d7e8f90",
  codigoErp: "01-000004212-1-000042-01-0001",
  fornecedorId: "4f8a1b2c-3d4e-4f50-a617-28394a5b6c7d",
  clienteId: null,
  produtoId: "c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  armazemId: "2b3c4d5e-6f70-4a81-9b2c-3d4e5f607182",
  item: 1,
  dtEmissao: "2026-08-28T00:00:00.000Z",
  ano: 2026,
  mes: 8,
  cfop: "1102",
  quantidade: 200,
  vlrUnitario: 39.5,
  vlrDesconto: 0,
  vlrTotal: 7900,
  vlrIcms: 1343,
  vlrIcmsSt: 210.75,
  vlrIpi: 0,
  peso: 1040,
  ativo: true,
  createdAt: "2026-09-08T12:00:00.000Z",
  updatedAt: "2026-09-08T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

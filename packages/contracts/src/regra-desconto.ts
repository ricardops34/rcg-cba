import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

/**
 * Regra de desconto (espelha a SZ0 do ERP): o cabeçalho define os tetos de
 * desconto e a comissão cheia; as faixas escalonam quanto dessa comissão o
 * vendedor recebe conforme o desconto concedido — 100% sem desconto, caindo
 * até 0% na última faixa.
 *
 * Cadastro puro por enquanto: nenhuma outra parte do sistema consulta estas
 * regras, e elas ainda não estão vinculadas a produto/categoria/cliente.
 * Escrita pela tela e pela API de integração (upsert por codigoErp).
 */

const percentual = (descricao: string) =>
  z.coerce.number().min(0).max(100).describe(descricao);

// Faixa: intervalo de desconto e o quanto da comissão sobra dentro dele.
export const regraDescontoFaixaLinhaSchema = z
  .object({
    sequencia: z.coerce.number().int().min(1).describe("Ordem da faixa dentro da regra (Z0_SEQ)"),
    percInicial: percentual("Desconto inicial da faixa, em % (Z0_PERCDE)"),
    percFinal: percentual("Desconto final da faixa, em % (Z0_PERCATE)"),
    percBaseComissao: percentual("% da comissão cheia pago nesta faixa (Z0_BASE)"),
  })
  .refine((f) => f.percFinal >= f.percInicial, {
    message: "O desconto final da faixa não pode ser menor que o inicial",
    path: ["percFinal"],
  });
export type RegraDescontoFaixaLinha = z.infer<typeof regraDescontoFaixaLinhaSchema>;

export const regraDescontoCreateSchema = z.object({
  codigoErp: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .optional()
    .describe("Código da regra no ERP (Z0_CODIGO) — chave de upsert da integração"),
  descricao: z.string().trim().min(2).max(120).describe("Nome da regra (Z0_DESC)"),
  // Percentuais do cabeçalho caem em 0 quando omitidos, como no banco — regra
  // sem comissão/sem desconto é caso real ("PRODUTO SEM COMISSAO").
  percDescontoAutorizado: percentual(
    "Percentual de desconto autorizado — Z0_DESCAUT ('% Desc. Aut')",
  ).default(0),
  percDescontoMaximo: percentual(
    "Percentual de desconto máximo — Z0_PERMAX ('% Desc Max')",
  ).default(0),
  percComissao: percentual(
    "Comissão cheia da regra, base do cálculo das faixas (Z0_COMISS)",
  ).default(0),
  padrao: z
    .boolean()
    .default(false)
    .describe("Regra usada quando nenhuma outra se aplica (Z0_PADRAO)"),
  ativo: z.boolean().default(true),
  // As faixas substituem o conjunto inteiro a cada gravação (mesmo padrão dos
  // itens de orçamento) — é assim que a tela mestre-detalhe salva.
  faixas: z.array(regraDescontoFaixaLinhaSchema).default([]),
});
export type RegraDescontoCreate = z.infer<typeof regraDescontoCreateSchema>;

export const regraDescontoUpdateSchema = regraDescontoCreateSchema.partial();
export type RegraDescontoUpdate = z.infer<typeof regraDescontoUpdateSchema>;

export const regraDescontoFaixaSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  regraDescontoId: z.string().uuid(),
  sequencia: z.number().int(),
  percInicial: z.number(),
  percFinal: z.number(),
  percBaseComissao: z.number(),
  ...auditFieldsSchema.shape,
});
export type RegraDescontoFaixa = z.infer<typeof regraDescontoFaixaSchema>;

export const regraDescontoSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  codigoErp: z.string().nullable(),
  descricao: z.string(),
  percDescontoAutorizado: z.number(),
  percDescontoMaximo: z.number(),
  percComissao: z.number(),
  padrao: z.boolean(),
  ativo: z.boolean(),
  faixas: z.array(regraDescontoFaixaSchema),
  ...auditFieldsSchema.shape,
});
export type RegraDesconto = z.infer<typeof regraDescontoSchema>;

export const regraDescontoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  padrao: booleanQueryParam,
});
export type RegraDescontoQuery = z.infer<typeof regraDescontoQuerySchema>;

export const REGRA_DESCONTO_CREATE_EXAMPLE: RegraDescontoCreate = {
  codigoErp: "000001",
  descricao: "REGRA GERAL",
  percDescontoAutorizado: 35,
  percDescontoMaximo: 30,
  percComissao: 10,
  padrao: true,
  ativo: true,
  faixas: [
    { sequencia: 1, percInicial: 0, percFinal: 10, percBaseComissao: 100 },
    { sequencia: 2, percInicial: 10.01, percFinal: 15, percBaseComissao: 90 },
    { sequencia: 3, percInicial: 15.01, percFinal: 20, percBaseComissao: 80 },
  ],
};

export const REGRA_DESCONTO_EXAMPLE: RegraDesconto = {
  id: "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  codigoErp: "000001",
  descricao: "REGRA GERAL",
  percDescontoAutorizado: 35,
  percDescontoMaximo: 30,
  percComissao: 10,
  padrao: true,
  ativo: true,
  faixas: [
    {
      id: "6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c9d",
      empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
      regraDescontoId: "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c",
      sequencia: 1,
      percInicial: 0,
      percFinal: 10,
      percBaseComissao: 100,
      createdAt: "2026-08-07T12:00:00.000Z",
      updatedAt: "2026-08-07T12:00:00.000Z",
      createdBy: null,
      updatedBy: null,
    },
  ],
  createdAt: "2026-08-07T12:00:00.000Z",
  updatedAt: "2026-08-07T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

/**
 * Resumo da regra vinculada, anexado às leituras de Categoria, Produto, item
 * de tabela de preço, item de nota de saída e item de orçamento — o suficiente
 * para exibir sem uma segunda consulta.
 */
export const regraDescontoVinculoSchema = z.object({
  id: z.string().uuid(),
  codigoErp: z.string().nullable(),
  descricao: z.string(),
});
export type RegraDescontoVinculo = z.infer<typeof regraDescontoVinculoSchema>;

/** Campos do vínculo, para espalhar (`...`) nos schemas de leitura. */
export const regraDescontoVinculoFields = {
  regraDescontoId: z.string().uuid().nullable().optional(),
  regraDesconto: regraDescontoVinculoSchema.nullable().optional(),
};

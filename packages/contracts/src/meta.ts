import { z } from "zod";
import { auditFieldsSchema } from "./common";

const anoSchema = z
  .coerce.number()
  .int()
  .min(2000)
  .max(2100)
  .describe("Ano de referência da meta (ex.: 2026)");

const mesSchema = z
  .coerce.number()
  .int()
  .min(1)
  .max(12)
  .describe("Mês de referência (1 = janeiro … 12 = dezembro)");

export const metaCreateSchema = z.object({
  colaboradorId: z
    .string()
    .uuid()
    .describe("Vendedor (colaborador) a quem a meta pertence"),
  ano: anoSchema,
  mes: mesSchema,
  valorObjetivo: z
    .coerce.number()
    .min(0)
    .default(0)
    .describe("Objetivo de faturamento do mês (R$)"),
  metaClientes: z
    .coerce.number()
    .int()
    .min(0)
    .default(0)
    .describe("Meta de positivação: número de clientes a atender no mês"),
  metaNovosClientes: z
    .coerce.number()
    .int()
    .min(0)
    .default(0)
    .describe("Meta de novos clientes (prospecção) no mês"),
  valorRealizado: z
    .coerce.number()
    .min(0)
    .default(0)
    .describe("Faturamento realizado no mês (R$). Lançado manualmente até haver integração com vendas."),
  clientesPositivados: z
    .coerce.number()
    .int()
    .min(0)
    .default(0)
    .describe("Clientes efetivamente atendidos (positivados) no mês"),
  observacao: z.string().trim().max(500).optional().describe("Observações livres sobre a meta"),
});
export type MetaCreate = z.infer<typeof metaCreateSchema>;

export const metaUpdateSchema = metaCreateSchema.omit({ colaboradorId: true }).partial();
export type MetaUpdate = z.infer<typeof metaUpdateSchema>;

export const metaSchema = metaCreateSchema.extend({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type Meta = z.infer<typeof metaSchema>;

// -----------------------------------------------------------------------------
// Dashboard de acompanhamento da equipe supervisionada
// -----------------------------------------------------------------------------

export const acompanhamentoQuerySchema = z.object({
  ano: anoSchema,
  mes: mesSchema,
});
export type AcompanhamentoQuery = z.infer<typeof acompanhamentoQuerySchema>;

export const acompanhamentoLinhaSchema = z.object({
  colaboradorId: z.string().uuid(),
  nome: z.string(),
  nomeReduzido: z.string().nullable(),
  codigoErp: z.string().nullable(),
  cargo: z.string(),
  superiorNome: z.string().nullable(),
  valorObjetivo: z.number(),
  valorRealizado: z.number(),
  metaClientes: z.number().int(),
  clientesPositivados: z.number().int(),
  percentual: z.number().describe("Realizado / objetivo, em % (0 quando não há objetivo)"),
});
export type AcompanhamentoLinha = z.infer<typeof acompanhamentoLinhaSchema>;

export const acompanhamentoResponseSchema = z.object({
  ano: z.number().int(),
  mes: z.number().int(),
  totalObjetivo: z.number(),
  totalRealizado: z.number(),
  percentualGeral: z.number(),
  totalVendedores: z.number().int(),
  comMeta: z.number().int().describe("Quantos vendedores da equipe têm meta cadastrada no período"),
  linhas: z.array(acompanhamentoLinhaSchema),
});
export type AcompanhamentoResponse = z.infer<typeof acompanhamentoResponseSchema>;

export const META_CREATE_EXAMPLE: MetaCreate = {
  colaboradorId: "27d0545c-106a-4cbd-bd66-3ca7a57cfc28",
  ano: 2026,
  mes: 7,
  valorObjetivo: 45000,
  metaClientes: 49,
  metaNovosClientes: 5,
  valorRealizado: 0,
  clientesPositivados: 0,
  observacao: undefined,
};

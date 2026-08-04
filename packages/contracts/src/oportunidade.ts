import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

export const estagioOportunidadeSchema = z.enum([
  "prospeccao",
  "qualificacao",
  "proposta",
  "negociacao",
  "ganha",
  "perdida",
]);
export type EstagioOportunidade = z.infer<typeof estagioOportunidadeSchema>;

export const oportunidadeCreateSchema = z.object({
  clienteId: z.string().uuid("Selecione um cliente"),
  vendedorId: z.string().uuid("Selecione um vendedor"),
  titulo: z.string().trim().min(1, "Informe um título").max(150),
  estagio: estagioOportunidadeSchema.default("prospeccao"),
  valorPrevisto: z.coerce.number().min(0).nullable().optional(),
  dataPrevisao: z.coerce.date().nullable().optional(),
  dataFechamento: z.coerce.date().nullable().optional(),
  motivoPerda: z.string().trim().max(300).optional().or(z.literal("")),
  observacao: z.string().trim().max(1000).optional().or(z.literal("")),
  ativo: z.boolean().default(true),
});
export type OportunidadeCreate = z.infer<typeof oportunidadeCreateSchema>;

export const oportunidadeUpdateSchema = oportunidadeCreateSchema.partial();
export type OportunidadeUpdate = z.infer<typeof oportunidadeUpdateSchema>;

export const oportunidadeSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  clienteId: z.string().uuid(),
  vendedorId: z.string().uuid(),
  titulo: z.string(),
  estagio: estagioOportunidadeSchema,
  valorPrevisto: z.number().nullable(),
  dataPrevisao: z.string().datetime().nullable(),
  dataFechamento: z.string().datetime().nullable(),
  motivoPerda: z.string().nullable(),
  observacao: z.string().nullable(),
  ativo: z.boolean(),
  cliente: z.object({
    id: z.string().uuid(),
    razaoSocial: z.string(),
    nomeFantasia: z.string().nullable(),
  }),
  vendedor: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    nomeReduzido: z.string().nullable(),
  }),
  ...auditFieldsSchema.shape,
});
export type Oportunidade = z.infer<typeof oportunidadeSchema>;

export const oportunidadeQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  estagio: estagioOportunidadeSchema.optional(),
  vendedorId: z.string().uuid().optional(),
  clienteId: z.string().uuid().optional(),
});
export type OportunidadeQuery = z.infer<typeof oportunidadeQuerySchema>;

export const OPORTUNIDADE_EXAMPLE: Oportunidade = {
  id: "a1b2c3d4-5e6f-4708-9a0b-1c2d3e4f5a6b",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  clienteId: "d4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70",
  vendedorId: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
  titulo: "Reposição de estoque — linha de limpeza",
  estagio: "negociacao",
  valorPrevisto: 12500,
  dataPrevisao: "2026-08-30T00:00:00.000Z",
  dataFechamento: null,
  motivoPerda: null,
  observacao: "",
  ativo: true,
  cliente: {
    id: "d4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70",
    razaoSocial: "MERCADO ANDRADE LTDA",
    nomeFantasia: "MERCADO ANDRADE",
  },
  vendedor: {
    id: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
    nome: "CARLOS SILVA",
    nomeReduzido: "CARLOS",
  },
  createdAt: "2026-08-02T12:00:00.000Z",
  updatedAt: "2026-08-02T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const OPORTUNIDADE_CREATE_EXAMPLE: OportunidadeCreate = {
  clienteId: "d4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70",
  vendedorId: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
  titulo: "Reposição de estoque — linha de limpeza",
  estagio: "prospeccao",
  valorPrevisto: 12500,
  dataPrevisao: new Date("2026-08-30T00:00:00.000Z"),
  dataFechamento: null,
  motivoPerda: "",
  observacao: "",
  ativo: true,
};

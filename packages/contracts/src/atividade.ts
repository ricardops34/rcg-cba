import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

export const tipoAtividadeSchema = z.enum(["ligacao", "reuniao", "email", "visita", "tarefa"]);
export type TipoAtividade = z.infer<typeof tipoAtividadeSchema>;

export const atividadeCreateSchema = z.object({
  clienteId: z.string().uuid().nullable().optional(),
  oportunidadeId: z.string().uuid().nullable().optional(),
  vendedorId: z.string().uuid("Selecione um vendedor"),
  tipo: tipoAtividadeSchema.default("tarefa"),
  titulo: z.string().trim().min(1, "Informe um título").max(150),
  descricao: z.string().trim().max(1000).optional().or(z.literal("")),
  dataVencimento: z.coerce.date().nullable().optional(),
  concluida: z.boolean().default(false),
  dataConclusao: z.coerce.date().nullable().optional(),
  ativo: z.boolean().default(true),
});
export type AtividadeCreate = z.infer<typeof atividadeCreateSchema>;

export const atividadeUpdateSchema = atividadeCreateSchema.partial();
export type AtividadeUpdate = z.infer<typeof atividadeUpdateSchema>;

export const atividadeSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  clienteId: z.string().uuid().nullable(),
  oportunidadeId: z.string().uuid().nullable(),
  vendedorId: z.string().uuid(),
  tipo: tipoAtividadeSchema,
  titulo: z.string(),
  descricao: z.string().nullable(),
  dataVencimento: z.string().datetime().nullable(),
  concluida: z.boolean(),
  dataConclusao: z.string().datetime().nullable(),
  ativo: z.boolean(),
  cliente: z
    .object({
      id: z.string().uuid(),
      razaoSocial: z.string(),
      nomeFantasia: z.string().nullable(),
    })
    .nullable(),
  oportunidade: z
    .object({
      id: z.string().uuid(),
      titulo: z.string(),
    })
    .nullable(),
  vendedor: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    nomeReduzido: z.string().nullable(),
  }),
  ...auditFieldsSchema.shape,
});
export type Atividade = z.infer<typeof atividadeSchema>;

export const atividadeQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  tipo: tipoAtividadeSchema.optional(),
  vendedorId: z.string().uuid().optional(),
  clienteId: z.string().uuid().optional(),
  oportunidadeId: z.string().uuid().optional(),
  concluida: booleanQueryParam,
  vencidas: booleanQueryParam.describe(
    "Atalho: dataVencimento no passado e concluida=false",
  ),
  dataInicio: z.coerce.date().optional().describe("Filtra dataVencimento >= dataInicio (uso: agenda)"),
  dataFim: z.coerce.date().optional().describe("Filtra dataVencimento <= dataFim (uso: agenda)"),
});
export type AtividadeQuery = z.infer<typeof atividadeQuerySchema>;

export const ATIVIDADE_EXAMPLE: Atividade = {
  id: "0d1e2f3a-4b5c-4d6e-7f80-91a2b3c4d5e6",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  clienteId: "d4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70",
  oportunidadeId: "a1b2c3d4-5e6f-4708-9a0b-1c2d3e4f5a6b",
  vendedorId: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
  tipo: "ligacao",
  titulo: "Ligar pra confirmar recebimento da proposta",
  descricao: "",
  dataVencimento: "2026-08-05T00:00:00.000Z",
  concluida: false,
  dataConclusao: null,
  ativo: true,
  cliente: {
    id: "d4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70",
    razaoSocial: "MERCADO ANDRADE LTDA",
    nomeFantasia: "MERCADO ANDRADE",
  },
  oportunidade: {
    id: "a1b2c3d4-5e6f-4708-9a0b-1c2d3e4f5a6b",
    titulo: "Reposição de estoque — linha de limpeza",
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

export const ATIVIDADE_CREATE_EXAMPLE: AtividadeCreate = {
  clienteId: "d4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70",
  oportunidadeId: "a1b2c3d4-5e6f-4708-9a0b-1c2d3e4f5a6b",
  vendedorId: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
  tipo: "ligacao",
  titulo: "Ligar pra confirmar recebimento da proposta",
  descricao: "",
  dataVencimento: new Date("2026-08-05T00:00:00.000Z"),
  concluida: false,
  dataConclusao: null,
  ativo: true,
};

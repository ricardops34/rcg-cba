import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

export const statusOrcamentoSchema = z.enum([
  "rascunho",
  "enviado",
  "aprovado",
  "recusado",
  "expirado",
]);
export type StatusOrcamento = z.infer<typeof statusOrcamentoSchema>;

// Linha de item — input de create/update (o server substitui o conjunto
// inteiro de itens a cada save, sem endpoint por linha, mesmo padrão de
// ObjetivoVendedorMes/categorias). vlrTabela/percDesconto/vlrDesconto/
// vlrTotal são calculados pelo server a partir da Tabela de Preço do
// cliente + vlrUnitario informado, não são input.
export const orcamentoItemLinhaSchema = z.object({
  produtoId: z.string().uuid(),
  quantidade: z.coerce.number().positive("Informe uma quantidade"),
  vlrUnitario: z.coerce.number().min(0, "Informe o preço unitário"),
});
export type OrcamentoItemLinha = z.infer<typeof orcamentoItemLinhaSchema>;

export const orcamentoCreateSchema = z.object({
  clienteId: z.string().uuid("Selecione um cliente"),
  vendedorId: z.string().uuid("Selecione um vendedor"),
  oportunidadeId: z.string().uuid().nullable().optional(),
  condicaoPagamentoId: z.string().uuid().nullable().optional(),
  titulo: z.string().trim().min(1, "Informe um título").max(150),
  status: statusOrcamentoSchema.default("rascunho"),
  dataValidade: z.coerce.date().nullable().optional(),
  // Ao ser definida (na criação ou numa edição que muda o valor), gera
  // automaticamente uma Atividade de acompanhamento vinculada a este
  // orçamento — ver OrcamentosService.
  dataRetorno: z.coerce.date().nullable().optional(),
  observacao: z.string().trim().max(1000).optional().or(z.literal("")),
  ativo: z.boolean().default(true),
  itens: z.array(orcamentoItemLinhaSchema).default([]),
});
export type OrcamentoCreate = z.infer<typeof orcamentoCreateSchema>;

export const orcamentoUpdateSchema = orcamentoCreateSchema.partial();
export type OrcamentoUpdate = z.infer<typeof orcamentoUpdateSchema>;

// Item — leitura, com o produto embutido (evita um segundo fetch no form/tabela).
const orcamentoItemProdutoSchema = z.object({
  id: z.string().uuid(),
  codigoErp: z.string(),
  descricao: z.string(),
  unidade: z.string().nullable(),
});

export const orcamentoItemSchema = z.object({
  id: z.string().uuid(),
  orcamentoId: z.string().uuid(),
  produtoId: z.string().uuid(),
  quantidade: z.number(),
  vlrTabela: z.number().nullable(),
  vlrUnitario: z.number(),
  percDesconto: z.number().nullable(),
  vlrDesconto: z.number(),
  vlrTotal: z.number(),
  produto: orcamentoItemProdutoSchema,
});
export type OrcamentoItem = z.infer<typeof orcamentoItemSchema>;

export const orcamentoSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  clienteId: z.string().uuid(),
  vendedorId: z.string().uuid(),
  oportunidadeId: z.string().uuid().nullable(),
  condicaoPagamentoId: z.string().uuid().nullable(),
  titulo: z.string(),
  status: statusOrcamentoSchema,
  dataValidade: z.string().datetime().nullable(),
  dataRetorno: z.string().datetime().nullable(),
  observacao: z.string().nullable(),
  vlrTotal: z.number(),
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
  oportunidade: z
    .object({
      id: z.string().uuid(),
      titulo: z.string(),
    })
    .nullable(),
  condicaoPagamento: z
    .object({
      id: z.string().uuid(),
      descricao: z.string(),
    })
    .nullable(),
  itens: z.array(orcamentoItemSchema),
  ...auditFieldsSchema.shape,
});
export type Orcamento = z.infer<typeof orcamentoSchema>;

export const orcamentoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  status: statusOrcamentoSchema.optional(),
  vendedorId: z.string().uuid().optional(),
  clienteId: z.string().uuid().optional(),
  oportunidadeId: z.string().uuid().optional(),
  dataInicio: z.coerce.date().optional().describe("Filtra createdAt >= dataInicio (uso: agenda)"),
  dataFim: z.coerce.date().optional().describe("Filtra createdAt <= dataFim (uso: agenda)"),
});
export type OrcamentoQuery = z.infer<typeof orcamentoQuerySchema>;

export const ORCAMENTO_EXAMPLE: Orcamento = {
  id: "0d1e2f3a-4b5c-4d6e-7f80-91a2b3c4d5e6",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  clienteId: "d4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70",
  vendedorId: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
  oportunidadeId: "a1b2c3d4-5e6f-4708-9a0b-1c2d3e4f5a6b",
  condicaoPagamentoId: "e1f2a3b4-5c6d-4e7f-8091-a2b3c4d5e6f7",
  titulo: "Proposta — reposição de estoque linha de limpeza",
  status: "enviado",
  dataValidade: "2026-08-20T00:00:00.000Z",
  dataRetorno: "2026-08-11T00:00:00.000Z",
  observacao: "",
  vlrTotal: 3676.5,
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
  oportunidade: {
    id: "a1b2c3d4-5e6f-4708-9a0b-1c2d3e4f5a6b",
    titulo: "Reposição de estoque — linha de limpeza",
  },
  condicaoPagamento: { id: "e1f2a3b4-5c6d-4e7f-8091-a2b3c4d5e6f7", descricao: "30/60/90 DIAS" },
  itens: [
    {
      id: "c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
      orcamentoId: "0d1e2f3a-4b5c-4d6e-7f80-91a2b3c4d5e6",
      produtoId: "9e8d7c6b-5a49-4382-b1c0-d9e8f7a6b5c4",
      quantidade: 5,
      vlrTabela: 735.3,
      vlrUnitario: 735.3,
      percDesconto: null,
      vlrDesconto: 0,
      vlrTotal: 3676.5,
      produto: {
        id: "9e8d7c6b-5a49-4382-b1c0-d9e8f7a6b5c4",
        codigoErp: "11400443",
        descricao: "DETERGENTE NEUTRO 5L",
        unidade: "GL",
      },
    },
  ],
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const ORCAMENTO_CREATE_EXAMPLE: OrcamentoCreate = {
  clienteId: "d4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70",
  vendedorId: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
  oportunidadeId: "a1b2c3d4-5e6f-4708-9a0b-1c2d3e4f5a6b",
  condicaoPagamentoId: "e1f2a3b4-5c6d-4e7f-8091-a2b3c4d5e6f7",
  titulo: "Proposta — reposição de estoque linha de limpeza",
  status: "rascunho",
  dataValidade: new Date("2026-08-20T00:00:00.000Z"),
  dataRetorno: new Date("2026-08-11T00:00:00.000Z"),
  observacao: "",
  ativo: true,
  itens: [{ produtoId: "9e8d7c6b-5a49-4382-b1c0-d9e8f7a6b5c4", quantidade: 5, vlrUnitario: 735.3 }],
};

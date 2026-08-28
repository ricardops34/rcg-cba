import { z } from "zod";
import { regraDescontoVinculoFields } from "./regra-desconto";
import {
  auditFieldsSchema,
  booleanQueryParam,
  paginationQuerySchema,
} from "./common";

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
  quantidade: z.coerce
    .number()
    .int("A quantidade deve ser um número inteiro")
    .positive("Informe uma quantidade"),
  vlrUnitario: z.coerce.number().min(0, "Informe o preço unitário"),
});

/**
 * Linha de item como o servidor a monta. Regra de desconto e comissão ficam
 * fora do schema de entrada de propósito: são somente leitura na tela e só a
 * API de integração as preenche — mas o cálculo dos itens (compartilhado
 * entre tela e integração) precisa carregá-las.
 */
export type OrcamentoItemLinha = z.infer<typeof orcamentoItemLinhaSchema> & {
  regraDescontoId?: string | null;
  percComissao?: number | null;
};

export const orcamentoCreateSchema = z.object({
  clienteId: z.string().uuid("Selecione um cliente"),
  // O vendedor do orçamento é o cadastrado no cliente: o servidor sobrescreve
  // o que vier aqui pelo vendedor do cliente, e só usa este valor quando o
  // cliente não tem vendedor vinculado. Na edição, o vendedor gravado só muda
  // se o cliente mudar (ver OrcamentosService.create/update).
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
  fotos: z.array(z.object({ url: z.string(), principal: z.boolean() })),
  exibirFotoOrcamento: z.boolean(),
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
  // Percentual de comissão apurado na linha (resultado da regra de desconto).
  // Nulo = ainda não apurado — o cálculo não existe por enquanto.
  percComissao: z.number().nullable().optional(),
  ...regraDescontoVinculoFields,
});
export type OrcamentoItem = z.infer<typeof orcamentoItemSchema>;

export const orcamentoSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  // Código do orçamento no ERP — null enquanto não for vinculado (ver
  // POST /integracao/orcamentos/pendentes/{id} da API de integração).
  // Aprovado + codigoLegado null = aguardando integração; codigoLegado
  // preenchido = já integrado. Alimenta o ícone de acompanhamento na
  // listagem de Orçamentos.
  codigoLegado: z.number().int().nullable(),
  // Numeração própria do CRM, sequencial por empresa e atribuída na criação —
  // é o "Nº" que o cliente vê na proposta em PDF. Não confundir com
  // codigoLegado (chave do ERP, preenchida só na integração).
  numero: z.number().int(),
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
  // Autorização de desconto (ver autorizacaoDescontoSituacao): preenchidas
  // pelas rotas de solicitar/autorizar, nunca pelo update comum.
  descontoSolicitadoEm: z.string().datetime().nullable(),
  descontoSolicitadoPor: z.string().nullable(),
  descontoAutorizadoEm: z.string().datetime().nullable(),
  descontoAutorizadoPor: z.string().nullable(),
  cliente: z.object({
    id: z.string().uuid(),
    razaoSocial: z.string(),
    nomeFantasia: z.string().nullable(),
  }),
  vendedor: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    nomeReduzido: z.string().nullable(),
    // Contato do vendedor no cabeçalho da proposta em PDF.
    email: z.string().nullable(),
    telefone: z.string().nullable(),
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

/**
 * Em que pé está a autorização de desconto do orçamento. Derivada dos quatro
 * campos gravados, para tela e servidor lerem a mesma coisa:
 *
 * - `nao_solicitada` — ninguém pediu ainda;
 * - `pendente` — o vendedor solicitou e o autorizador ainda não respondeu;
 * - `autorizada` — liberado; PDF e efetivação voltam a funcionar.
 *
 * Alterar itens ou preços derruba a autorização (o servidor limpa os campos no
 * update), senão daria para autorizar 15% e gravar 40% depois.
 */
export type AutorizacaoDescontoSituacao =
  "nao_solicitada" | "pendente" | "autorizada";

export function autorizacaoDescontoSituacao(o: {
  descontoSolicitadoEm: string | Date | null;
  descontoAutorizadoEm: string | Date | null;
}): AutorizacaoDescontoSituacao {
  if (o.descontoAutorizadoEm) return "autorizada";
  if (o.descontoSolicitadoEm) return "pendente";
  return "nao_solicitada";
}

export const orcamentoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  status: statusOrcamentoSchema.optional(),
  vendedorId: z.string().uuid().optional(),
  clienteId: z.string().uuid().optional(),
  oportunidadeId: z.string().uuid().optional(),
  dataInicio: z.coerce
    .date()
    .optional()
    .describe("Filtra createdAt >= dataInicio (uso: agenda)"),
  dataFim: z.coerce
    .date()
    .optional()
    .describe("Filtra createdAt <= dataFim (uso: agenda)"),
});
export type OrcamentoQuery = z.infer<typeof orcamentoQuerySchema>;

export const ORCAMENTO_EXAMPLE: Orcamento = {
  id: "0d1e2f3a-4b5c-4d6e-7f80-91a2b3c4d5e6",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  codigoLegado: null,
  numero: 128,
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
  descontoSolicitadoEm: null,
  descontoSolicitadoPor: null,
  descontoAutorizadoEm: null,
  descontoAutorizadoPor: null,
  cliente: {
    id: "d4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70",
    razaoSocial: "MERCADO ANDRADE LTDA",
    nomeFantasia: "MERCADO ANDRADE",
  },
  vendedor: {
    id: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
    nome: "CARLOS SILVA",
    nomeReduzido: "CARLOS",
    email: "carlos@andrade.com.br",
    telefone: "67999887766",
  },
  oportunidade: {
    id: "a1b2c3d4-5e6f-4708-9a0b-1c2d3e4f5a6b",
    titulo: "Reposição de estoque — linha de limpeza",
  },
  condicaoPagamento: {
    id: "e1f2a3b4-5c6d-4e7f-8091-a2b3c4d5e6f7",
    descricao: "30/60/90 DIAS",
  },
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
        fotos: [],
        exibirFotoOrcamento: false,
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
  itens: [
    {
      produtoId: "9e8d7c6b-5a49-4382-b1c0-d9e8f7a6b5c4",
      quantidade: 5,
      vlrUnitario: 735.3,
    },
  ],
};

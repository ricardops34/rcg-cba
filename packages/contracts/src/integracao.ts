import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";
import { tipoPessoaSchema } from "./cliente";
import { statusOrcamentoSchema } from "./orcamento";

// ------------------------------------------------------------------
// Categorias
// ------------------------------------------------------------------

export const integracaoCategoriaCreateSchema = z.object({
  codigoErp: z.string().trim().min(1).max(30).describe("Chave natural do registro"),
  descricao: z.string().trim().min(1).max(120).describe("Nome da categoria"),
  categoriaPaiCodigo: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .optional()
    .describe("codigoErp da categoria pai, se esta for uma subcategoria"),
  regraDescontoCodigo: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .optional()
    .describe("codigoErp da regra de desconto (Z0_CODIGO da SZ0)"),
  ativo: z.boolean().default(true),
});
export type IntegracaoCategoriaCreate = z.infer<typeof integracaoCategoriaCreateSchema>;

export const integracaoCategoriaUpdateSchema = integracaoCategoriaCreateSchema
  .omit({ codigoErp: true })
  .partial();
export type IntegracaoCategoriaUpdate = z.infer<typeof integracaoCategoriaUpdateSchema>;

export const integracaoCategoriaSchema = integracaoCategoriaCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type IntegracaoCategoria = z.infer<typeof integracaoCategoriaSchema>;

export const integracaoCategoriaQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type IntegracaoCategoriaQuery = z.infer<typeof integracaoCategoriaQuerySchema>;

export const INTEGRACAO_CATEGORIA_CREATE_EXAMPLE: IntegracaoCategoriaCreate = {
  codigoErp: "000004",
  descricao: "COZINHA",
  categoriaPaiCodigo: null,
  regraDescontoCodigo: null,
  ativo: true,
};

export const INTEGRACAO_CATEGORIA_EXAMPLE: IntegracaoCategoria = {
  ...INTEGRACAO_CATEGORIA_CREATE_EXAMPLE,
  id: "9e8d7c6b-5a49-4382-b1c0-d9e8f7a6b5c4",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

// ------------------------------------------------------------------
// Condições de pagamento
// ------------------------------------------------------------------

export const integracaoCondicaoPagamentoCreateSchema = z.object({
  codigoErp: z.string().trim().min(1).max(30).describe("Chave natural do registro"),
  descricao: z.string().trim().min(1).max(150),
  forma: z.string().trim().max(3).nullable().optional().describe("Código da forma de pagamento"),
  ativo: z.boolean().default(true),
});
export type IntegracaoCondicaoPagamentoCreate = z.infer<
  typeof integracaoCondicaoPagamentoCreateSchema
>;

export const integracaoCondicaoPagamentoUpdateSchema = integracaoCondicaoPagamentoCreateSchema
  .omit({ codigoErp: true })
  .partial();
export type IntegracaoCondicaoPagamentoUpdate = z.infer<
  typeof integracaoCondicaoPagamentoUpdateSchema
>;

export const integracaoCondicaoPagamentoSchema = integracaoCondicaoPagamentoCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type IntegracaoCondicaoPagamento = z.infer<typeof integracaoCondicaoPagamentoSchema>;

export const integracaoCondicaoPagamentoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type IntegracaoCondicaoPagamentoQuery = z.infer<
  typeof integracaoCondicaoPagamentoQuerySchema
>;

export const INTEGRACAO_CONDICAO_PAGAMENTO_CREATE_EXAMPLE: IntegracaoCondicaoPagamentoCreate = {
  codigoErp: "001",
  descricao: "BOLETO 28 DIAS",
  forma: "BOL",
  ativo: true,
};

export const INTEGRACAO_CONDICAO_PAGAMENTO_EXAMPLE: IntegracaoCondicaoPagamento = {
  ...INTEGRACAO_CONDICAO_PAGAMENTO_CREATE_EXAMPLE,
  id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

// ------------------------------------------------------------------
// Armazéns
// ------------------------------------------------------------------

export const integracaoArmazemCreateSchema = z.object({
  codigoErp: z.string().trim().min(1).max(30).describe("Chave natural do registro"),
  descricao: z.string().trim().min(1).max(150),
  ativo: z.boolean().default(true),
});
export type IntegracaoArmazemCreate = z.infer<typeof integracaoArmazemCreateSchema>;

export const integracaoArmazemUpdateSchema = integracaoArmazemCreateSchema
  .omit({ codigoErp: true })
  .partial();
export type IntegracaoArmazemUpdate = z.infer<typeof integracaoArmazemUpdateSchema>;

export const integracaoArmazemSchema = integracaoArmazemCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type IntegracaoArmazem = z.infer<typeof integracaoArmazemSchema>;

export const integracaoArmazemQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type IntegracaoArmazemQuery = z.infer<typeof integracaoArmazemQuerySchema>;

export const INTEGRACAO_ARMAZEM_CREATE_EXAMPLE: IntegracaoArmazemCreate = {
  codigoErp: "001",
  descricao: "ARMAZÉM CENTRAL",
  ativo: true,
};

export const INTEGRACAO_ARMAZEM_EXAMPLE: IntegracaoArmazem = {
  ...INTEGRACAO_ARMAZEM_CREATE_EXAMPLE,
  id: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

// ------------------------------------------------------------------
// Produtos
// ------------------------------------------------------------------

export const integracaoProdutoCreateSchema = z.object({
  codigoErp: z.string().trim().min(1).max(30).describe("Chave natural do registro"),
  descricao: z.string().trim().min(1).max(120),
  unidade: z.string().trim().max(4).nullable().optional().describe("Unidade de medida (ex.: UN, KG, GL)"),
  categoriaCodigo: z.string().trim().max(30).nullable().optional().describe("codigoErp da categoria"),
  subCategoriaCodigo: z.string().trim().max(30).nullable().optional().describe("codigoErp da subcategoria"),
  armazemCodigo: z.string().trim().max(30).nullable().optional().describe("codigoErp do armazém padrão"),
  marca: z.string().trim().max(40).nullable().optional(),
  codigoBarras: z.string().trim().max(30).nullable().optional(),
  ncm: z.string().trim().max(20).nullable().optional(),
  qtdEmbalagem: z.coerce.number().min(0).nullable().optional(),
  peso: z.coerce.number().min(0).nullable().optional(),
  ultimoPreco: z.coerce.number().min(0).nullable().optional(),
  observacao: z.string().trim().max(500).nullable().optional(),
  regraDescontoCodigo: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .optional()
    .describe("codigoErp da regra de desconto (Z0_CODIGO da SZ0)"),
  ativo: z.boolean().default(true),
});
export type IntegracaoProdutoCreate = z.infer<typeof integracaoProdutoCreateSchema>;

export const integracaoProdutoUpdateSchema = integracaoProdutoCreateSchema
  .omit({ codigoErp: true })
  .partial();
export type IntegracaoProdutoUpdate = z.infer<typeof integracaoProdutoUpdateSchema>;

export const integracaoProdutoSchema = integracaoProdutoCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type IntegracaoProduto = z.infer<typeof integracaoProdutoSchema>;

export const integracaoProdutoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type IntegracaoProdutoQuery = z.infer<typeof integracaoProdutoQuerySchema>;

export const INTEGRACAO_PRODUTO_CREATE_EXAMPLE: IntegracaoProdutoCreate = {
  codigoErp: "11400443",
  descricao: "DETERGENTE NEUTRO 5L",
  unidade: "GL",
  categoriaCodigo: "000004",
  subCategoriaCodigo: null,
  armazemCodigo: "001",
  marca: "AUDAX",
  codigoBarras: "7898920071234",
  ncm: "34022000",
  qtdEmbalagem: 4,
  peso: 5.2,
  ultimoPreco: 28.9,
  observacao: "",
  regraDescontoCodigo: null,
  ativo: true,
};

export const INTEGRACAO_PRODUTO_EXAMPLE: IntegracaoProduto = {
  ...INTEGRACAO_PRODUTO_CREATE_EXAMPLE,
  id: "c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

// ------------------------------------------------------------------
// Vendedores
// ------------------------------------------------------------------
// gerente/gerenteId e usuarioId nunca são tocados pelo ERP — são vínculos
// mantidos manualmente na tela (organograma/login), mesmo critério dos
// scripts de import.

export const integracaoVendedorCreateSchema = z.object({
  codigoErp: z.string().trim().min(1).max(30).describe("Chave natural do registro"),
  nome: z.string().trim().min(1).max(100),
  nomeReduzido: z.string().trim().max(50).nullable().optional(),
  telefone: z.string().trim().max(15).nullable().optional(),
  email: z.string().trim().max(100).nullable().optional(),
  dataNascimento: z.coerce.date().nullable().optional(),
  vendedor: z.boolean().default(true).describe("true = atua como vendedor de carteira"),
  supervisorCodigo: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .optional()
    .describe("codigoErp do vendedor que é supervisor deste"),
  supervisor: z.boolean().default(false).describe("true = este vendedor é supervisor de outros"),
  percComissao: z.coerce
    .number()
    .min(0)
    .max(100)
    .nullable()
    .optional()
    .describe("Percentual de comissão do vendedor"),
  ativo: z.boolean().default(true),
  desligado: z.boolean().default(false),
});
export type IntegracaoVendedorCreate = z.infer<typeof integracaoVendedorCreateSchema>;

export const integracaoVendedorUpdateSchema = integracaoVendedorCreateSchema
  .omit({ codigoErp: true })
  .partial();
export type IntegracaoVendedorUpdate = z.infer<typeof integracaoVendedorUpdateSchema>;

export const integracaoVendedorSchema = integracaoVendedorCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type IntegracaoVendedor = z.infer<typeof integracaoVendedorSchema>;

export const integracaoVendedorQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type IntegracaoVendedorQuery = z.infer<typeof integracaoVendedorQuerySchema>;

export const INTEGRACAO_VENDEDOR_CREATE_EXAMPLE: IntegracaoVendedorCreate = {
  codigoErp: "000234",
  nome: "FABIANO OLIVEIRA",
  nomeReduzido: "FABIANO",
  telefone: "(67) 3354-9465",
  email: "fabiano@rcg.com.br",
  dataNascimento: null,
  vendedor: true,
  supervisorCodigo: null,
  supervisor: false,
  percComissao: 4,
  ativo: true,
  desligado: false,
};

export const INTEGRACAO_VENDEDOR_EXAMPLE: IntegracaoVendedor = {
  ...INTEGRACAO_VENDEDOR_CREATE_EXAMPLE,
  id: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

// ------------------------------------------------------------------
// Clientes
// ------------------------------------------------------------------
// Coleções filhas (CNAEs/contatos/sócios) ficam fora desta versão — os
// models ainda não existem (ver docs/planos/cadastros-cliente-cnae-contatos-socios.md).

export const integracaoClienteCreateSchema = z.object({
  codigoErp: z.string().trim().min(1).max(30).describe("Chave natural do registro"),
  tipoPessoa: tipoPessoaSchema.default("juridica"),
  razaoSocial: z.string().trim().min(1).max(150),
  nomeFantasia: z.string().trim().max(150).nullable().optional(),
  cnpjCpf: z.string().trim().max(20).nullable().optional(),
  inscricaoEstadual: z.string().trim().max(20).nullable().optional(),
  inscricaoMunicipal: z.string().trim().max(20).nullable().optional(),
  contribuinteIcms: z.boolean().nullable().optional(),
  rg: z.string().trim().max(20).nullable().optional(),
  dataNascimento: z.coerce.date().nullable().optional(),
  contato: z.string().trim().max(100).nullable().optional(),
  email: z.string().trim().max(120).nullable().optional(),
  telefone: z.string().trim().max(20).nullable().optional(),
  telefone2: z.string().trim().max(20).nullable().optional(),
  celular: z.string().trim().max(20).nullable().optional(),
  endereco: z.string().trim().max(150).nullable().optional(),
  complemento: z.string().trim().max(100).nullable().optional(),
  bairro: z.string().trim().max(100).nullable().optional(),
  municipio: z.string().trim().max(100).nullable().optional(),
  uf: z.string().trim().max(2).nullable().optional(),
  cep: z.string().trim().max(10).nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  vendedorCodigo: z.string().trim().max(30).nullable().optional().describe("codigoErp do vendedor"),
  tabelaPrecoCodigo: z.string().trim().max(30).nullable().optional().describe("codigoErp da tabela de preço"),
  condicaoPagamentoCodigo: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .optional()
    .describe("codigoErp da condição de pagamento padrão"),
  ativo: z.boolean().default(true),
  carteira: z.boolean().nullable().optional(),
  site: z.string().trim().max(150).nullable().optional(),
  limiteCredito: z.coerce.number().min(0).nullable().optional(),
  vencimentoLimite: z.coerce.date().nullable().optional(),
  observacao: z.string().trim().max(1000).nullable().optional(),
  dataBloqueio: z.coerce.date().nullable().optional(),
  observacaoBloqueio: z.string().trim().max(500).nullable().optional(),
  dataReativacao: z.coerce.date().nullable().optional(),
  observacaoReativacao: z.string().trim().max(500).nullable().optional(),
  primeiraCompra: z.coerce.date().nullable().optional(),
  ultimaVisita: z.coerce.date().nullable().optional(),
  ultimaCompra: z.coerce.date().nullable().optional(),
  ultimoAtendimento: z.coerce.date().nullable().optional(),
  dataConsultaRfb: z.coerce.date().nullable().optional(),
});
export type IntegracaoClienteCreate = z.infer<typeof integracaoClienteCreateSchema>;

export const integracaoClienteUpdateSchema = integracaoClienteCreateSchema
  .omit({ codigoErp: true })
  .partial();
export type IntegracaoClienteUpdate = z.infer<typeof integracaoClienteUpdateSchema>;

export const integracaoClienteSchema = integracaoClienteCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type IntegracaoCliente = z.infer<typeof integracaoClienteSchema>;

export const integracaoClienteQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type IntegracaoClienteQuery = z.infer<typeof integracaoClienteQuerySchema>;

/**
 * Resposta do PUT de cliente. Desde 2026-08-14 o ERP **não grava direto**:
 * a alteração entra na fila de aprovação interna (ver `cliente-alteracao.ts`),
 * então `cliente` é o cadastro **como está agora** — ainda sem as mudanças
 * enviadas —, `pendente` diz se ficou algo aguardando aprovação e
 * `camposPendentes` lista o que mudou em relação ao que já estava gravado.
 *
 * Reenviar o mesmo payload é inofensivo: o diff sai vazio, `pendente` volta
 * `false` e nada é enfileirado.
 */
export const integracaoClienteUpdateResultadoSchema = z.object({
  cliente: integracaoClienteSchema,
  pendente: z.boolean().describe("Há alteração aguardando aprovação interna"),
  camposPendentes: z
    .array(z.string())
    .describe("Campos que diferem do cadastro atual e foram enfileirados"),
});
export type IntegracaoClienteUpdateResultado = z.infer<
  typeof integracaoClienteUpdateResultadoSchema
>;

export const INTEGRACAO_CLIENTE_CREATE_EXAMPLE: IntegracaoClienteCreate = {
  codigoErp: "004417",
  tipoPessoa: "juridica",
  razaoSocial: "MERCADO ANDRADE LTDA",
  nomeFantasia: "MERCADO ANDRADE",
  cnpjCpf: "12345678000190",
  inscricaoEstadual: "283456789",
  inscricaoMunicipal: null,
  contribuinteIcms: true,
  rg: null,
  dataNascimento: null,
  contato: "JOSE ANDRADE",
  email: "compras@mercadoandrade.com.br",
  telefone: "(67) 3321-4455",
  telefone2: null,
  celular: "(67) 99911-2233",
  endereco: "RUA MARECHAL RONDON, 1520",
  complemento: null,
  bairro: "CENTRO",
  municipio: "CAMPO GRANDE",
  uf: "MS",
  cep: "79002-201",
  latitude: null,
  longitude: null,
  vendedorCodigo: "000234",
  tabelaPrecoCodigo: "001",
  condicaoPagamentoCodigo: "001",
  ativo: true,
  carteira: true,
  site: null,
  limiteCredito: 15000,
  vencimentoLimite: null,
  observacao: null,
  dataBloqueio: null,
  observacaoBloqueio: null,
  dataReativacao: null,
  observacaoReativacao: null,
  primeiraCompra: new Date("2019-03-12T00:00:00.000Z"),
  ultimaVisita: null,
  ultimaCompra: new Date("2026-06-30T00:00:00.000Z"),
  ultimoAtendimento: null,
  dataConsultaRfb: null,
};

export const INTEGRACAO_CLIENTE_EXAMPLE: IntegracaoCliente = {
  ...INTEGRACAO_CLIENTE_CREATE_EXAMPLE,
  id: "d4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

// ------------------------------------------------------------------
// Tabela de preços (mestre-detalhe)
// ------------------------------------------------------------------

export const integracaoTabelaPrecoItemSchema = z.object({
  produtoCodigo: z.string().trim().min(1).max(30).describe("codigoErp do produto"),
  preco: z.coerce.number().min(0),
  regraDescontoCodigo: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .optional()
    .describe("codigoErp da regra de desconto (Z0_CODIGO da SZ0)"),
  ativo: z.boolean().default(true),
});
export type IntegracaoTabelaPrecoItem = z.infer<typeof integracaoTabelaPrecoItemSchema>;

export const integracaoTabelaPrecoCreateSchema = z.object({
  codigoErp: z.string().trim().min(1).max(30).describe("Chave natural do registro"),
  descricao: z.string().trim().min(1).max(150),
  dtInicio: z.coerce.date().nullable().optional(),
  dtFim: z.coerce.date().nullable().optional(),
  ativo: z.boolean().default(true),
  itens: z
    .array(integracaoTabelaPrecoItemSchema)
    .default([])
    .describe("Substitui o conjunto inteiro de itens a cada PATCH"),
});
export type IntegracaoTabelaPrecoCreate = z.infer<typeof integracaoTabelaPrecoCreateSchema>;

export const integracaoTabelaPrecoUpdateSchema = integracaoTabelaPrecoCreateSchema
  .omit({ codigoErp: true })
  .partial();
export type IntegracaoTabelaPrecoUpdate = z.infer<typeof integracaoTabelaPrecoUpdateSchema>;

export const integracaoTabelaPrecoSchema = integracaoTabelaPrecoCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type IntegracaoTabelaPreco = z.infer<typeof integracaoTabelaPrecoSchema>;

export const integracaoTabelaPrecoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type IntegracaoTabelaPrecoQuery = z.infer<typeof integracaoTabelaPrecoQuerySchema>;

export const INTEGRACAO_TABELA_PRECO_CREATE_EXAMPLE: IntegracaoTabelaPrecoCreate = {
  codigoErp: "001",
  descricao: "TABELA PADRAO",
  dtInicio: new Date("2019-07-11T00:00:00.000Z"),
  dtFim: null,
  ativo: true,
  itens: [{ produtoCodigo: "11400443", preco: 735.3, regraDescontoCodigo: null, ativo: true }],
};

export const INTEGRACAO_TABELA_PRECO_EXAMPLE: IntegracaoTabelaPreco = {
  ...INTEGRACAO_TABELA_PRECO_CREATE_EXAMPLE,
  id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

// ------------------------------------------------------------------
// Estoque — chave composta (produtoCodigo + armazemCodigo), sem codigoErp
// próprio.
// ------------------------------------------------------------------

export const integracaoEstoqueCreateSchema = z.object({
  produtoCodigo: z.string().trim().min(1).max(30).describe("codigoErp do produto (parte da chave)"),
  armazemCodigo: z.string().trim().min(1).max(30).describe("codigoErp do armazém (parte da chave)"),
  saldo: z.coerce.number().default(0),
  reserva: z.coerce.number().nullable().optional(),
  custo: z.coerce.number().nullable().optional(),
  ultimoPreco: z.coerce.number().nullable().optional(),
  ultimaCompra: z.coerce.date().nullable().optional(),
});
export type IntegracaoEstoqueCreate = z.infer<typeof integracaoEstoqueCreateSchema>;

export const integracaoEstoqueUpdateSchema = integracaoEstoqueCreateSchema
  .omit({ produtoCodigo: true, armazemCodigo: true })
  .partial();
export type IntegracaoEstoqueUpdate = z.infer<typeof integracaoEstoqueUpdateSchema>;

export const integracaoEstoqueSchema = integracaoEstoqueCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type IntegracaoEstoque = z.infer<typeof integracaoEstoqueSchema>;

export const integracaoEstoqueQuerySchema = paginationQuerySchema.extend({
  produtoCodigo: z.string().trim().optional(),
  armazemCodigo: z.string().trim().optional(),
});
export type IntegracaoEstoqueQuery = z.infer<typeof integracaoEstoqueQuerySchema>;

export const INTEGRACAO_ESTOQUE_CREATE_EXAMPLE: IntegracaoEstoqueCreate = {
  produtoCodigo: "11400443",
  armazemCodigo: "001",
  saldo: 128,
  reserva: 12,
  custo: 21.4,
  ultimoPreco: 28.9,
  ultimaCompra: new Date("2026-06-18T00:00:00.000Z"),
};

export const INTEGRACAO_ESTOQUE_EXAMPLE: IntegracaoEstoque = {
  ...INTEGRACAO_ESTOQUE_CREATE_EXAMPLE,
  id: "8b9c0d1e-2f3a-4b4c-5d6e-7f8091a2b3c4",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

// ------------------------------------------------------------------
// Objetivos (mestre-detalhe) — chave: codigoLegado (id da linha no ERP,
// vendedor/mês/ano sozinhos não são únicos o bastante).
// ------------------------------------------------------------------

export const integracaoObjetivoCategoriaSchema = z.object({
  categoriaCodigo: z.string().trim().min(1).max(30).describe("codigoErp da categoria"),
  valor: z.coerce.number().min(0),
});
export type IntegracaoObjetivoCategoria = z.infer<typeof integracaoObjetivoCategoriaSchema>;

export const integracaoObjetivoCreateSchema = z.object({
  codigoLegado: z.coerce.number().int().describe("Chave natural do registro (id da linha no ERP)"),
  vendedorCodigo: z.string().trim().min(1).max(30),
  mes: z.coerce.number().int().min(1).max(12),
  ano: z.coerce.number().int().min(2000).max(2100),
  valor: z.coerce.number().min(0).default(0),
  numeroCliente: z.coerce.number().min(0).nullable().optional(),
  novoCliente: z.coerce.number().min(0).nullable().optional(),
  tipo: z.string().trim().max(1).nullable().optional(),
  ativo: z.boolean().default(true),
  categorias: z
    .array(integracaoObjetivoCategoriaSchema)
    .default([])
    .describe("Substitui o conjunto inteiro de metas por categoria a cada PATCH"),
});
export type IntegracaoObjetivoCreate = z.infer<typeof integracaoObjetivoCreateSchema>;

export const integracaoObjetivoUpdateSchema = integracaoObjetivoCreateSchema
  .omit({ codigoLegado: true })
  .partial();
export type IntegracaoObjetivoUpdate = z.infer<typeof integracaoObjetivoUpdateSchema>;

export const integracaoObjetivoSchema = integracaoObjetivoCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type IntegracaoObjetivo = z.infer<typeof integracaoObjetivoSchema>;

export const integracaoObjetivoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  ano: z.coerce.number().int().optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
});
export type IntegracaoObjetivoQuery = z.infer<typeof integracaoObjetivoQuerySchema>;

export const INTEGRACAO_OBJETIVO_CREATE_EXAMPLE: IntegracaoObjetivoCreate = {
  codigoLegado: 5821,
  vendedorCodigo: "000234",
  mes: 7,
  ano: 2026,
  valor: 85600,
  numeroCliente: 85,
  novoCliente: null,
  tipo: null,
  ativo: true,
  categorias: [{ categoriaCodigo: "000004", valor: 13805.34 }],
};

export const INTEGRACAO_OBJETIVO_EXAMPLE: IntegracaoObjetivo = {
  ...INTEGRACAO_OBJETIVO_CREATE_EXAMPLE,
  id: "a1b2c3d4-5e6f-4708-9a0b-1c2d3e4f5a6b",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

// ------------------------------------------------------------------
// Notas de saída (mestre-detalhe) — chave: codigoLegado.
// ------------------------------------------------------------------
// clienteId/vendedorId/dtEmissao dos itens são denormalizados a partir do
// cabeçalho pelo próprio service — não fazem parte do payload do item.

export const integracaoNotaSaidaItemSchema = z.object({
  codigoLegado: z.coerce.number().int().describe("Chave natural do item (id da linha no ERP)"),
  produtoCodigo: z.string().trim().max(30).nullable().optional(),
  item: z.coerce.number().int().nullable().optional().describe("Número sequencial do item na nota"),
  cfop: z.string().trim().max(10).nullable().optional(),
  tipo: z.string().trim().max(1).nullable().optional(),
  quantidade: z.coerce.number().default(0),
  vlrUnitario: z.coerce.number().default(0),
  vlrTabela: z.coerce.number().nullable().optional(),
  percDesconto: z.coerce.number().nullable().optional(),
  vlrDesconto: z.coerce.number().default(0),
  vlrTotal: z.coerce.number().default(0),
  quantidadeDev: z.coerce.number().nullable().optional(),
  vlrDev: z.coerce.number().nullable().optional(),
  peso: z.coerce.number().nullable().optional(),
  comodato: z.boolean().default(false),
  percComissao: z.coerce
    .number()
    .min(0)
    .max(100)
    .nullable()
    .optional()
    .describe("Percentual de comissão apurado na linha"),
  regraDescontoCodigo: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .optional()
    .describe("codigoErp da regra de desconto (Z0_CODIGO da SZ0)"),
  ativo: z.boolean().default(true),
});
export type IntegracaoNotaSaidaItem = z.infer<typeof integracaoNotaSaidaItemSchema>;

export const integracaoNotaSaidaCreateSchema = z.object({
  codigoLegado: z.coerce.number().int().describe("Chave natural do registro"),
  clienteCodigo: z.string().trim().max(30).nullable().optional(),
  vendedorCodigo: z.string().trim().max(30).nullable().optional(),
  condicaoCodigo: z.string().trim().max(30).nullable().optional(),
  numero: z.string().trim().min(1).max(20),
  serie: z.string().trim().max(5).nullable().optional(),
  especieFiscal: z.string().trim().max(10).nullable().optional(),
  tipo: z.string().trim().max(1).nullable().optional(),
  dtEmissao: z.coerce.date().nullable().optional().describe("ano/mes são derivados desta data"),
  vlrBruto: z.coerce.number().default(0),
  vlrMercadoria: z.coerce.number().default(0),
  vlrItens: z.coerce.number().default(0),
  vlrDesconto: z.coerce.number().default(0),
  vlrIcms: z.coerce.number().default(0),
  vlrIpi: z.coerce.number().default(0),
  vlrFrete: z.coerce.number().default(0),
  vlrDevolucao: z.coerce.number().default(0),
  chaveNfe: z.string().trim().max(44).nullable().optional(),
  dtNfe: z.coerce.date().nullable().optional(),
  mensagem: z.string().trim().max(500).nullable().optional(),
  comodato: z.boolean().default(false),
  ativo: z.boolean().default(true),
  itens: z
    .array(integracaoNotaSaidaItemSchema)
    .default([])
    .describe("Substitui o conjunto inteiro de itens a cada PATCH"),
});
export type IntegracaoNotaSaidaCreate = z.infer<typeof integracaoNotaSaidaCreateSchema>;

export const integracaoNotaSaidaUpdateSchema = integracaoNotaSaidaCreateSchema
  .omit({ codigoLegado: true })
  .partial();
export type IntegracaoNotaSaidaUpdate = z.infer<typeof integracaoNotaSaidaUpdateSchema>;

export const integracaoNotaSaidaSchema = integracaoNotaSaidaCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type IntegracaoNotaSaida = z.infer<typeof integracaoNotaSaidaSchema>;

export const integracaoNotaSaidaQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  /**
   * `semXml=true` lista o que ainda não tem XML autorizado na plataforma —
   * é como o ERP descobre o que falta enviar numa carga retroativa, sem
   * precisar perguntar nota a nota. `semXml=false` traz só as que já têm.
   */
  semXml: booleanQueryParam,
});
export type IntegracaoNotaSaidaQuery = z.infer<typeof integracaoNotaSaidaQuerySchema>;

export const INTEGRACAO_NOTA_SAIDA_CREATE_EXAMPLE: IntegracaoNotaSaidaCreate = {
  codigoLegado: 116067,
  clienteCodigo: "004417",
  vendedorCodigo: "000234",
  condicaoCodigo: "001",
  numero: "000116067",
  serie: "1",
  especieFiscal: "SPED",
  tipo: "N",
  dtEmissao: new Date("2026-06-30T00:00:00.000Z"),
  vlrBruto: 1260.5,
  vlrMercadoria: 1200,
  vlrItens: 1200,
  vlrDesconto: 0,
  vlrIcms: 204,
  vlrIpi: 0,
  vlrFrete: 60.5,
  vlrDevolucao: 0,
  chaveNfe: "50260600000000000191550010001160671000116060",
  dtNfe: new Date("2026-06-30T00:00:00.000Z"),
  mensagem: null,
  comodato: false,
  ativo: true,
  itens: [
    {
      codigoLegado: 402118,
      produtoCodigo: "11400443",
      item: 1,
      cfop: "5102",
      tipo: "N",
      quantidade: 3,
      vlrUnitario: 42,
      vlrTabela: 42,
      percDesconto: 0,
      vlrDesconto: 0,
      vlrTotal: 126,
      quantidadeDev: null,
      vlrDev: null,
      peso: 15.6,
      comodato: false,
      ativo: true,
    },
  ],
};

export const INTEGRACAO_NOTA_SAIDA_EXAMPLE: IntegracaoNotaSaida = {
  ...INTEGRACAO_NOTA_SAIDA_CREATE_EXAMPLE,
  id: "9c0d1e2f-3a4b-4c5d-6e7f-8091a2b3c4d5",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

// ------------------------------------------------------------------
// XML autorizado da NF-e (insumo do DANFE — 2ª via).
// ------------------------------------------------------------------
// Ver docs/planos/segunda-via-danfe-boleto.md. A plataforma guarda o XML e
// renderiza o DANFE sob demanda; não guarda o PDF.

export const integracaoNfeXmlSchema = z
  .object({
    xml: z
      .string()
      .min(1)
      .optional()
      .describe("Conteúdo do XML autorizado (nfeProc), em texto"),
    xmlBase64: z
      .string()
      .min(1)
      .optional()
      .describe("O mesmo XML em base64 — alternativa para ERP que não escapa texto em JSON"),
  })
  // Um dos dois, nunca os dois: com ambos preenchidos não há como saber qual é
  // o arquivo verdadeiro, e gravar o errado só apareceria na hora da 2ª via.
  .refine((v) => !!v.xml !== !!v.xmlBase64, {
    message: "Envie xml OU xmlBase64 (exatamente um dos dois)",
  });
export type IntegracaoNfeXml = z.infer<typeof integracaoNfeXmlSchema>;

export const INTEGRACAO_NFE_XML_EXAMPLE: IntegracaoNfeXml = {
  xml: '<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">...</nfeProc>',
};

/** Resposta do envio do XML: o que a plataforma extraiu e guardou. */
export const integracaoNfeXmlResultadoSchema = z.object({
  codigoLegado: z.number().int(),
  chaveNfe: z.string(),
  numero: z.string().nullable(),
  serie: z.string().nullable(),
  protocolo: z.string().nullable(),
  situacao: z.string(),
  recebidoEm: z.string().datetime(),
});
export type IntegracaoNfeXmlResultado = z.infer<typeof integracaoNfeXmlResultadoSchema>;

export const INTEGRACAO_NFE_XML_RESULTADO_EXAMPLE: IntegracaoNfeXmlResultado = {
  codigoLegado: 45012,
  chaveNfe: "50260600000000000191550010001160671000116060",
  numero: "116067",
  serie: "1",
  protocolo: "150260000123456",
  situacao: "autorizada",
  recebidoEm: "2026-08-21T18:12:00.000Z",
};

/**
 * Situação do XML de uma nota, para o ERP conferir o que já entregou.
 *
 * `conteudo` só vem quando pedido explicitamente (`?conteudo=true`): numa
 * varredura de milhares de notas, devolver o arquivo inteiro a cada consulta
 * transformaria a conferência no maior tráfego da integração.
 */
export const integracaoNfeXmlStatusSchema = z.object({
  codigoLegado: z.number().int(),
  temXml: z.boolean(),
  chaveNfe: z.string().nullable(),
  protocolo: z.string().nullable(),
  situacao: z.string().nullable(),
  recebidoEm: z.string().datetime().nullable(),
  tamanhoBytes: z.number().int().nullable(),
  conteudo: z.string().nullable().optional(),
});
export type IntegracaoNfeXmlStatus = z.infer<typeof integracaoNfeXmlStatusSchema>;

export const INTEGRACAO_NFE_XML_STATUS_EXAMPLE: IntegracaoNfeXmlStatus = {
  codigoLegado: 45012,
  temXml: true,
  chaveNfe: "50260600000000000191550010001160671000116060",
  protocolo: "150260000123456",
  situacao: "autorizada",
  recebidoEm: "2026-08-21T18:12:00.000Z",
  tamanhoBytes: 7412,
};

// ------------------------------------------------------------------
// Títulos a receber — chave: codigoLegado.
// ------------------------------------------------------------------

export const integracaoTituloReceberCreateSchema = z.object({
  codigoLegado: z.coerce.number().int().describe("Chave natural do registro"),
  clienteCodigo: z.string().trim().max(30).nullable().optional(),
  vendedorCodigo: z.string().trim().max(30).nullable().optional(),
  numero: z.string().trim().min(1).max(20),
  parcela: z.string().trim().max(5).nullable().optional(),
  prefixo: z.string().trim().max(10).nullable().optional(),
  tipo: z.string().trim().max(5).nullable().optional(),
  emissao: z.coerce.date().nullable().optional(),
  vencimento: z.coerce.date().nullable().optional(),
  vencimentoReal: z.coerce.date().nullable().optional(),
  valor: z.coerce.number().default(0),
  saldo: z.coerce.number().default(0),
  acrescimo: z.coerce.number().nullable().optional(),
  decrescimo: z.coerce.number().nullable().optional(),
  dtBaixa: z.coerce.date().nullable().optional(),
  formaPgto: z.string().trim().max(5).nullable().optional(),
  historico: z.string().trim().max(500).nullable().optional(),
  ativo: z.boolean().default(true),

  // ---- Cobrança bancária: o que a 2ª via de boleto precisa saber ----
  // (ver docs/planos/segunda-via-danfe-boleto.md). Todos opcionais: título de
  // outra forma de pagamento (dinheiro, depósito, PIX) não tem boleto.
  nossoNumero: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .optional()
    .describe(
      "Identificação do boleto no banco, gerada pelo ERP no registro. Sem ela a plataforma não emite 2ª via.",
    ),
  carteira: z
    .string()
    .trim()
    .max(2)
    .nullable()
    .optional()
    .describe("Carteira do título, quando difere da carteira da conta de cobrança"),
  contaBancariaDescricao: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional()
    .describe(
      "Conta de cobrança usada no registro, pela descrição cadastrada na plataforma. Omitido = conta padrão da empresa.",
    ),
  codigoBarras: z
    .string()
    .trim()
    .max(44)
    .nullable()
    .optional()
    .describe(
      "Código de barras como o banco registrou (44 dígitos). Quando enviado, prevalece sobre o cálculo da plataforma.",
    ),
  linhaDigitavel: z
    .string()
    .trim()
    .max(60)
    .nullable()
    .optional()
    .describe("Linha digitável registrada (47 dígitos). Derivada do código de barras quando omitida."),
});
export type IntegracaoTituloReceberCreate = z.infer<typeof integracaoTituloReceberCreateSchema>;

export const integracaoTituloReceberUpdateSchema = integracaoTituloReceberCreateSchema
  .omit({ codigoLegado: true })
  .partial();
export type IntegracaoTituloReceberUpdate = z.infer<typeof integracaoTituloReceberUpdateSchema>;

export const integracaoTituloReceberSchema = integracaoTituloReceberCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type IntegracaoTituloReceber = z.infer<typeof integracaoTituloReceberSchema>;

export const integracaoTituloReceberQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type IntegracaoTituloReceberQuery = z.infer<typeof integracaoTituloReceberQuerySchema>;

export const INTEGRACAO_TITULO_RECEBER_CREATE_EXAMPLE: IntegracaoTituloReceberCreate = {
  codigoLegado: 88214,
  clienteCodigo: "004417",
  vendedorCodigo: "000234",
  numero: "000116067",
  parcela: "A",
  prefixo: "NF",
  tipo: "NF",
  emissao: new Date("2026-06-30T00:00:00.000Z"),
  vencimento: new Date("2026-07-28T00:00:00.000Z"),
  vencimentoReal: new Date("2026-07-28T00:00:00.000Z"),
  valor: 1260.5,
  saldo: 1260.5,
  acrescimo: null,
  decrescimo: null,
  dtBaixa: null,
  formaPgto: "B",
  historico: null,
  ativo: true,
  nossoNumero: "00000001160",
  carteira: "09",
  contaBancariaDescricao: "Bradesco 237 — carteira 09",
  codigoBarras: null,
  linhaDigitavel: null,
};

export const INTEGRACAO_TITULO_RECEBER_EXAMPLE: IntegracaoTituloReceber = {
  ...INTEGRACAO_TITULO_RECEBER_CREATE_EXAMPLE,
  id: "1e2f3a4b-5c6d-4e7f-8091-a2b3c4d5e6f7",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

// ------------------------------------------------------------------
// Orçamentos (mestre-detalhe) — chave: codigoLegado.
// ------------------------------------------------------------------
// Sem oportunidadeCodigo: Oportunidade é um recurso interno do CRM (nasce só
// pela tela), sem chave de legado — vínculo a uma oportunidade, se desejado,
// é feito depois manualmente na tela. dataRetorno preenchida (ou alterada)
// gera a mesma Atividade de acompanhamento automática de quando o orçamento
// é criado pela tela.

export const integracaoOrcamentoItemSchema = z.object({
  produtoCodigo: z.string().trim().min(1).max(30).describe("codigoErp do produto"),
  quantidade: z.coerce.number().positive(),
  vlrUnitario: z.coerce.number().min(0),
  percComissao: z.coerce
    .number()
    .min(0)
    .max(100)
    .nullable()
    .optional()
    .describe("Percentual de comissão apurado na linha"),
  regraDescontoCodigo: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .optional()
    .describe("codigoErp da regra de desconto (Z0_CODIGO da SZ0)"),
});
export type IntegracaoOrcamentoItem = z.infer<typeof integracaoOrcamentoItemSchema>;

export const integracaoOrcamentoCreateSchema = z.object({
  codigoLegado: z.coerce.number().int().describe("Chave natural do registro"),
  clienteCodigo: z.string().trim().min(1).max(30),
  vendedorCodigo: z.string().trim().min(1).max(30),
  condicaoPagamentoCodigo: z.string().trim().max(30).nullable().optional(),
  titulo: z.string().trim().min(1).max(150),
  status: statusOrcamentoSchema.default("rascunho"),
  dataValidade: z.coerce.date().nullable().optional(),
  dataRetorno: z.coerce.date().nullable().optional(),
  observacao: z.string().trim().max(1000).nullable().optional(),
  ativo: z.boolean().default(true),
  itens: z
    .array(integracaoOrcamentoItemSchema)
    .default([])
    .describe("Substitui o conjunto inteiro de itens a cada PATCH"),
});
export type IntegracaoOrcamentoCreate = z.infer<typeof integracaoOrcamentoCreateSchema>;

export const integracaoOrcamentoUpdateSchema = integracaoOrcamentoCreateSchema
  .omit({ codigoLegado: true })
  .partial();
export type IntegracaoOrcamentoUpdate = z.infer<typeof integracaoOrcamentoUpdateSchema>;

export const integracaoOrcamentoSchema = integracaoOrcamentoCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type IntegracaoOrcamento = z.infer<typeof integracaoOrcamentoSchema>;

export const integracaoOrcamentoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  status: statusOrcamentoSchema.optional(),
});
export type IntegracaoOrcamentoQuery = z.infer<typeof integracaoOrcamentoQuerySchema>;

// Vincula um orçamento aprovado criado na plataforma (sem codigoLegado) ao
// código que o ERP passa a usar pra ele — ver GET/PATCH .../pendentes
// abaixo. Só pode ser feito uma vez por orçamento (não pode reatribuir).
export const integracaoOrcamentoVincularSchema = z.object({
  codigoLegado: z.coerce
    .number()
    .int()
    .positive()
    .describe("Código gerado no ERP pra esse orçamento, ao importar"),
});
export type IntegracaoOrcamentoVincular = z.infer<typeof integracaoOrcamentoVincularSchema>;

export const INTEGRACAO_ORCAMENTO_CREATE_EXAMPLE: IntegracaoOrcamentoCreate = {
  codigoLegado: 7301,
  clienteCodigo: "004417",
  vendedorCodigo: "000234",
  condicaoPagamentoCodigo: "001",
  titulo: "Proposta — reposição de estoque linha de limpeza",
  status: "enviado",
  dataValidade: new Date("2026-08-20T00:00:00.000Z"),
  dataRetorno: new Date("2026-08-11T00:00:00.000Z"),
  observacao: null,
  ativo: true,
  itens: [{ produtoCodigo: "11400443", quantidade: 5, vlrUnitario: 735.3, regraDescontoCodigo: null }],
};

export const INTEGRACAO_ORCAMENTO_EXAMPLE: IntegracaoOrcamento = {
  ...INTEGRACAO_ORCAMENTO_CREATE_EXAMPLE,
  id: "0d1e2f3a-4b5c-4d6e-7f80-91a2b3c4d5e6",
  createdAt: "2026-08-04T12:00:00.000Z",
  updatedAt: "2026-08-04T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

export const INTEGRACAO_ORCAMENTO_VINCULAR_EXAMPLE: IntegracaoOrcamentoVincular = {
  codigoLegado: 7301,
};

// ------------------------------------------------------------------
// Regras de desconto (mestre-detalhe) — chave: codigoErp (Z0_CODIGO da SZ0).
// ------------------------------------------------------------------
// As faixas vêm no mesmo corpo e substituem o conjunto inteiro a cada PATCH,
// como os itens de orçamento — o ERP é dono da regra completa.

export const integracaoRegraDescontoFaixaSchema = z.object({
  sequencia: z.coerce.number().int().min(1).describe("Z0_SEQ"),
  percInicial: z.coerce.number().min(0).max(100).describe("Desconto inicial da faixa (Z0_PERCDE)"),
  percFinal: z.coerce.number().min(0).max(100).describe("Desconto final da faixa (Z0_PERCATE)"),
  percBaseComissao: z.coerce
    .number()
    .min(0)
    .max(100)
    .describe("% da comissão cheia paga nesta faixa (Z0_BASE)"),
});
export type IntegracaoRegraDescontoFaixa = z.infer<typeof integracaoRegraDescontoFaixaSchema>;

export const integracaoRegraDescontoCreateSchema = z.object({
  codigoErp: z.string().trim().min(1).max(30).describe("Chave natural do registro (Z0_CODIGO)"),
  descricao: z.string().trim().min(1).max(120).describe("Z0_DESC"),
  percDescontoAutorizado: z.coerce
    .number()
    .min(0)
    .max(100)
    .default(0)
    .describe("Percentual de desconto autorizado (Z0_DESCAUT)"),
  percDescontoMaximo: z.coerce
    .number()
    .min(0)
    .max(100)
    .default(0)
    .describe("Percentual de desconto máximo (Z0_PERMAX)"),
  percComissao: z.coerce
    .number()
    .min(0)
    .max(100)
    .default(0)
    .describe("Comissão cheia da regra (Z0_COMISS)"),
  padrao: z.boolean().default(false).describe("Regra padrão da empresa (Z0_PADRAO)"),
  ativo: z.boolean().default(true),
  faixas: z
    .array(integracaoRegraDescontoFaixaSchema)
    .default([])
    .describe("Substitui o conjunto inteiro de faixas a cada PATCH"),
});
export type IntegracaoRegraDescontoCreate = z.infer<typeof integracaoRegraDescontoCreateSchema>;

export const integracaoRegraDescontoUpdateSchema = integracaoRegraDescontoCreateSchema
  .omit({ codigoErp: true })
  .partial();
export type IntegracaoRegraDescontoUpdate = z.infer<typeof integracaoRegraDescontoUpdateSchema>;

export const integracaoRegraDescontoSchema = integracaoRegraDescontoCreateSchema.extend({
  id: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type IntegracaoRegraDesconto = z.infer<typeof integracaoRegraDescontoSchema>;

export const integracaoRegraDescontoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type IntegracaoRegraDescontoQuery = z.infer<typeof integracaoRegraDescontoQuerySchema>;

export const INTEGRACAO_REGRA_DESCONTO_CREATE_EXAMPLE: IntegracaoRegraDescontoCreate = {
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
  ],
};

export const INTEGRACAO_REGRA_DESCONTO_EXAMPLE: IntegracaoRegraDesconto = {
  ...INTEGRACAO_REGRA_DESCONTO_CREATE_EXAMPLE,
  id: "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c",
  createdAt: "2026-08-07T12:00:00.000Z",
  updatedAt: "2026-08-07T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

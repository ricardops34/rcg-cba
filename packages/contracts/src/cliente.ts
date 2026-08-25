import { z } from "zod";
import { auditFieldsSchema, booleanQueryParam, paginationQuerySchema } from "./common";

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const tipoPessoaSchema = z
  .enum(["fisica", "juridica"])
  .describe("Tipo de pessoa do cliente (física ou jurídica)");
export type TipoPessoa = z.infer<typeof tipoPessoaSchema>;

export const clienteCreateSchema = z.object({
  codigoErp: opt(30),
  tipoPessoa: tipoPessoaSchema.default("juridica"),
  razaoSocial: z.string().trim().min(1, "Informe a razão social").max(150),
  nomeFantasia: opt(150),
  cnpjCpf: opt(20),
  inscricaoEstadual: opt(20),
  inscricaoMunicipal: opt(20),
  contribuinteIcms: z.boolean().nullable().optional(),
  rg: opt(20),
  dataNascimento: z.coerce.date().nullable().optional(),

  contato: opt(100),
  email: z.string().trim().max(120).email("E-mail inválido").optional().or(z.literal("")),
  telefone: opt(20),
  telefone2: opt(20),
  celular: opt(20),

  endereco: opt(150),
  complemento: opt(100),
  bairro: opt(100),
  municipio: opt(100),
  uf: opt(2),
  cep: opt(10),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),

  vendedorId: z.string().uuid().nullable().optional(),
  tabelaPrecoId: z.string().uuid().nullable().optional(),
  condicaoPagamentoId: z.string().uuid().nullable().optional(),
  ativo: z.boolean().default(true),
  carteira: z.boolean().nullable().optional(),
  site: opt(150),
  limiteCredito: z.coerce.number().min(0).nullable().optional(),
  vencimentoLimite: z.coerce.date().nullable().optional(),
  observacao: opt(1000),

  dataBloqueio: z.coerce.date().nullable().optional(),
  observacaoBloqueio: opt(500),
  dataReativacao: z.coerce.date().nullable().optional(),
  observacaoReativacao: opt(500),
});
export type ClienteCreate = z.infer<typeof clienteCreateSchema>;

export const clienteUpdateSchema = clienteCreateSchema.partial();
export type ClienteUpdate = z.infer<typeof clienteUpdateSchema>;

// Campos de histórico comercial: preenchidos pelo import do legado (e no
// futuro pela API externa de manutenção), nunca pelo formulário — por isso
// ficam fora do create/update e só aparecem na leitura.
const historicoComercialSchema = z.object({
  primeiraCompra: z.string().datetime().nullable(),
  ultimaVisita: z.string().datetime().nullable(),
  ultimaCompra: z.string().datetime().nullable(),
  ultimoAtendimento: z.string().datetime().nullable(),
  dataConsultaRfb: z.string().datetime().nullable(),
});

// Vínculos resolvidos que acompanham o detalhe do cliente (GET /clientes/:id):
// a descrição não pode ser buscada no formulário, porque as listas de
// /tabelas-preco e /condicoes-pagamento exigem permissão de cadastro e só
// trazem registros ativos. Ausentes na listagem, por isso opcionais.
const vinculoSchema = z.object({
  id: z.string().uuid(),
  codigoErp: z.string().nullable(),
  descricao: z.string(),
});

export const clienteSchema = clienteCreateSchema.extend({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  tabelaPreco: vinculoSchema.nullable().optional(),
  condicaoPagamento: vinculoSchema.nullable().optional(),
  ...historicoComercialSchema.shape,
  ...auditFieldsSchema.shape,
});
export type Cliente = z.infer<typeof clienteSchema>;

// Filtros de listagem, além de busca/paginação/ordenação (paginationQuerySchema).
export const clienteQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
  tipoPessoa: tipoPessoaSchema.optional(),
  uf: z.string().trim().length(2).optional(),
  /**
   * Município do cadastro, comparado inteiro e sem diferenciar maiúsculas —
   * o legado grava em caixa alta e o usuário digita como fala.
   */
  municipio: z.string().trim().max(60).optional(),
  vendedorId: z.string().uuid().optional(),
  carteira: booleanQueryParam,
  /**
   * Ramo de atividade, por **prefixo** do código CNAE.
   *
   * O prefixo não é preguiça: o código é hierárquico, então `56` pega
   * alimentação inteira, `5611` todo o food service e `5611201` só
   * restaurantes. Um campo só cobre "clientes do ramo X" em qualquer
   * granularidade, sem precisar escolher o nível antes.
   */
  cnae: z
    .string()
    .trim()
    .regex(/^\d{2,7}$/, "Informe de 2 a 7 dígitos do código CNAE")
    .optional(),
});
export type ClienteQuery = z.infer<typeof clienteQuerySchema>;

export const CLIENTE_EXAMPLE: Cliente = {
  id: "d4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  codigoErp: "004417",
  tipoPessoa: "juridica",
  razaoSocial: "MERCADO ANDRADE LTDA",
  nomeFantasia: "MERCADO ANDRADE",
  cnpjCpf: "12345678000190",
  inscricaoEstadual: "283456789",
  inscricaoMunicipal: "",
  contribuinteIcms: true,
  rg: "",
  dataNascimento: null,
  contato: "JOSE ANDRADE",
  email: "compras@mercadoandrade.com.br",
  telefone: "(67) 3321-4455",
  telefone2: "",
  celular: "(67) 99911-2233",
  endereco: "RUA MARECHAL RONDON, 1520",
  complemento: "",
  bairro: "CENTRO",
  municipio: "CAMPO GRANDE",
  uf: "MS",
  cep: "79002-201",
  latitude: null,
  longitude: null,
  vendedorId: "b7c2c1de-4a45-4b8a-9f2e-6a1d6c1e9f10",
  tabelaPrecoId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  condicaoPagamentoId: "9c8b7a6f-5e4d-4c3b-8a2f-1e0d9c8b7a6f",
  ativo: true,
  carteira: true,
  site: "",
  limiteCredito: 15000,
  vencimentoLimite: null,
  observacao: "",
  dataBloqueio: null,
  observacaoBloqueio: "",
  dataReativacao: null,
  observacaoReativacao: "",
  primeiraCompra: "2019-03-12T00:00:00.000Z",
  ultimaVisita: null,
  ultimaCompra: "2026-06-30T00:00:00.000Z",
  ultimoAtendimento: null,
  dataConsultaRfb: null,
  createdAt: "2026-07-24T12:00:00.000Z",
  updatedAt: "2026-07-24T12:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

// apenasComCliente=true: além do escopo hierárquico normal, só devolve
// vendedores com pelo menos um cliente vinculado, e inclui os bloqueados
// (ativo:false) — usado no filtro rápido de vendedor da Posição de Cliente,
// que precisa localizar/filtrar até vendedor bloqueado que ainda tenha
// clientes na carteira. Sem o parâmetro, comportamento igual a sempre foi
// (só vendedores ativos, sem exigir cliente).
export const vendedoresEscopoQuerySchema = z.object({
  apenasComCliente: booleanQueryParam,
  // Facetas irmãs já selecionadas no filtro (Posição de Cliente/Clientes) —
  // restringem a lista de vendedores a quem tem cliente batendo com elas.
  uf: z.string().trim().length(2).optional(),
  municipio: z.string().trim().optional(),
});
export type VendedoresEscopoQuery = z.infer<typeof vendedoresEscopoQuerySchema>;

// Facetas irmãs (uf/vendedorId ou município/vendedorId) já selecionadas no
// filtro — cada endpoint de escopo (uf/município/vendedor) usa as dos outros
// dois pra restringir sua própria contagem/lista.
export const municipiosEscopoQuerySchema = z.object({
  uf: z.string().trim().length(2).optional(),
  vendedorId: z.string().uuid().optional(),
});
export type MunicipiosEscopoQuery = z.infer<typeof municipiosEscopoQuerySchema>;

export const ufsEscopoQuerySchema = z.object({
  municipio: z.string().trim().optional(),
  vendedorId: z.string().uuid().optional(),
});
export type UfsEscopoQuery = z.infer<typeof ufsEscopoQuerySchema>;

export const CLIENTE_CREATE_EXAMPLE: ClienteCreate = {
  codigoErp: "004417",
  tipoPessoa: "juridica",
  razaoSocial: "MERCADO ANDRADE LTDA",
  nomeFantasia: "MERCADO ANDRADE",
  cnpjCpf: "12345678000190",
  inscricaoEstadual: "283456789",
  inscricaoMunicipal: "",
  contribuinteIcms: true,
  rg: "",
  dataNascimento: null,
  contato: "JOSE ANDRADE",
  email: "compras@mercadoandrade.com.br",
  telefone: "(67) 3321-4455",
  telefone2: "",
  celular: "(67) 99911-2233",
  endereco: "RUA MARECHAL RONDON, 1520",
  complemento: "",
  bairro: "CENTRO",
  municipio: "CAMPO GRANDE",
  uf: "MS",
  cep: "79002-201",
  latitude: null,
  longitude: null,
  vendedorId: null,
  tabelaPrecoId: null,
  condicaoPagamentoId: null,
  ativo: true,
  carteira: true,
  site: "",
  limiteCredito: 15000,
  vencimentoLimite: null,
  observacao: "",
  dataBloqueio: null,
  observacaoBloqueio: "",
  dataReativacao: null,
  observacaoReativacao: "",
};

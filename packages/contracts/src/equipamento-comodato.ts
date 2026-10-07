import { z } from "zod";
import { booleanQueryParam, paginationQuerySchema } from "./common";

/**
 * Equipamentos de comodato: o produto que pode ser comodatado (cabeçalho) e
 * os produtos que se aplicam nele (itens). Ver
 * docs/planos/equipamentos-comodato.md.
 *
 * Os itens são a relação `aplicacao` de produtos relacionados — a mesma do
 * card "Relacionados" do produto e do assistente. Cadastrar aqui ou lá dá no
 * mesmo.
 */

const produtoRefSchema = z.object({
  id: z.string().uuid(),
  codigoErp: z.string(),
  descricao: z.string(),
  unidade: z.string().nullable(),
  categoria: z.string().nullable(),
  ativo: z.boolean(),
});

export const equipamentoComodatoSchema = z.object({
  id: z.string().uuid(),
  produto: produtoRefSchema,
  observacao: z.string().nullable(),
  ativo: z.boolean(),
  /** Quantos produtos aplicáveis estão cadastrados. */
  totalAplicacoes: z.number().int(),
  /** Clientes que já receberam o equipamento em remessa de comodato. */
  totalClientes: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type EquipamentoComodato = z.infer<typeof equipamentoComodatoSchema>;

/** Item do detalhe: um produto aplicável ao equipamento. */
export const equipamentoAplicacaoSchema = z.object({
  /** Id da relação em produto_relacionados — é ele que se exclui. */
  id: z.string().uuid(),
  produto: produtoRefSchema,
  observacao: z.string().nullable(),
});
export type EquipamentoAplicacao = z.infer<typeof equipamentoAplicacaoSchema>;

export const equipamentoComodatoDetalheSchema = equipamentoComodatoSchema.extend({
  aplicacoes: z.array(equipamentoAplicacaoSchema),
});
export type EquipamentoComodatoDetalhe = z.infer<typeof equipamentoComodatoDetalheSchema>;

export const equipamentoComodatoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam.optional(),
  /** true = só os que ainda não têm nenhum produto aplicável. */
  semAplicacao: booleanQueryParam.optional(),
});
export type EquipamentoComodatoQuery = z.infer<typeof equipamentoComodatoQuerySchema>;

export const equipamentoComodatoCriarSchema = z.object({
  produtoId: z.string().uuid(),
  observacao: z.string().trim().max(500).nullable().optional(),
});
export type EquipamentoComodatoCriar = z.infer<typeof equipamentoComodatoCriarSchema>;

export const equipamentoComodatoEditarSchema = z.object({
  observacao: z.string().trim().max(500).nullable().optional(),
  ativo: z.boolean().optional(),
});
export type EquipamentoComodatoEditar = z.infer<typeof equipamentoComodatoEditarSchema>;

export const equipamentoAplicacaoCriarSchema = z.object({
  produtoId: z.string().uuid(),
  observacao: z.string().trim().max(200).nullable().optional(),
});
export type EquipamentoAplicacaoCriar = z.infer<typeof equipamentoAplicacaoCriarSchema>;

/**
 * Sugestão de produto aplicável, por compra conjunta: entre os clientes que
 * receberam o equipamento, quantos compram o produto, comparado com todos os
 * clientes. É sugestão — só grava quando alguém confirma.
 */
export const equipamentoSugestaoSchema = z.object({
  produto: produtoRefSchema,
  /** Clientes com o equipamento que compraram o produto (últimos 24 meses). */
  clientesComEquipamento: z.number().int(),
  /** % entre os clientes com o equipamento. */
  percentualComEquipamento: z.number(),
  /** % entre todos os clientes que compraram algo no período. */
  percentualGeral: z.number(),
  /** A descrição tem palavra em comum com a do equipamento. */
  descricaoParecida: z.boolean(),
});
export type EquipamentoSugestao = z.infer<typeof equipamentoSugestaoSchema>;

/**
 * Itens comuns aos clientes com o equipamento: entre os clientes que **ainda
 * estão** com ele (enviado − devolvido > 0) e compraram nos últimos 24 meses,
 * quantos compram cada produto — agrupado por subcategoria, porque cada
 * cliente compra uma versão diferente do mesmo papel, e é o grupo que mostra
 * o padrão (medido: 84% por subcategoria contra 31% do produto mais comprado).
 */
export const equipamentoComunsQuerySchema = z.object({
  /** Cobertura mínima do grupo, em % dos clientes com o equipamento. */
  minimo: z.coerce.number().int().min(1).max(100).default(50),
});
export type EquipamentoComunsQuery = z.infer<typeof equipamentoComunsQuerySchema>;

export const equipamentoComumProdutoSchema = z.object({
  produto: produtoRefSchema,
  clientes: z.number().int(),
  percentual: z.number(),
});

export const equipamentoComumGrupoSchema = z.object({
  /** Subcategoria do produto; null = produto sem subcategoria. */
  subcategoria: z.object({ id: z.string().uuid(), descricao: z.string() }).nullable(),
  /** Clientes com o equipamento que compram qualquer produto do grupo. */
  clientes: z.number().int(),
  percentual: z.number(),
  produtos: z.array(equipamentoComumProdutoSchema),
});
export type EquipamentoComumGrupo = z.infer<typeof equipamentoComumGrupoSchema>;

export const equipamentoComunsSchema = z.object({
  /** Base: clientes com o equipamento em poder que compraram no período. */
  totalClientes: z.number().int(),
  grupos: z.array(equipamentoComumGrupoSchema),
});
export type EquipamentoComuns = z.infer<typeof equipamentoComunsSchema>;

/** Vários produtos aplicáveis de uma vez (a seleção das sugestões). */
export const equipamentoAplicacaoLoteSchema = z.object({
  produtoIds: z.array(z.string().uuid()).min(1).max(100),
});
export type EquipamentoAplicacaoLote = z.infer<typeof equipamentoAplicacaoLoteSchema>;

export const equipamentoAplicacaoLoteResultadoSchema = z.object({
  adicionados: z.number().int(),
  /** O que não entrou e por quê (já cadastrado, categoria de equipamento…). */
  recusados: z.array(z.object({ produtoId: z.string().uuid(), motivo: z.string() })),
});
export type EquipamentoAplicacaoLoteResultado = z.infer<
  typeof equipamentoAplicacaoLoteResultadoSchema
>;

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD");

/**
 * Filtros do "Popular pelas notas". Produto bloqueado nunca entra, com ou sem
 * filtro. Sem categoria = todas; sem data = todo o histórico.
 */
export const equipamentoPopularSchema = z
  .object({
    /** Categoria ou subcategoria do produto (casa com qualquer das duas). */
    categoriaIds: z.array(z.string().uuid()).max(200).optional(),
    /** Emissão da nota de remessa, inclusive. */
    dataInicio: dataIso.optional(),
    dataFim: dataIso.optional(),
    /** Devolve ao cadastro os equipamentos excluídos que caem no filtro. */
    restaurarExcluidos: z.boolean().optional(),
  })
  .refine((v) => !v.dataInicio || !v.dataFim || v.dataInicio <= v.dataFim, {
    message: "A data inicial não pode ser depois da final",
    path: ["dataFim"],
  });
export type EquipamentoPopular = z.infer<typeof equipamentoPopularSchema>;

/**
 * Categorias que aparecem nas remessas de comodato — as opções do filtro do
 * "Popular". `equipamento` = marcada como categoria de equipamento, que o
 * diálogo já traz selecionada.
 */
export const equipamentoPopularCategoriaSchema = z.object({
  id: z.string().uuid(),
  codigoErp: z.string().nullable(),
  descricao: z.string(),
  equipamento: z.boolean(),
  /** Produtos ativos dessa categoria que já saíram em remessa de comodato. */
  produtos: z.number().int(),
});
export type EquipamentoPopularCategoria = z.infer<typeof equipamentoPopularCategoriaSchema>;

export const equipamentoExcluirLoteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});
export type EquipamentoExcluirLote = z.infer<typeof equipamentoExcluirLoteSchema>;

export const equipamentoExcluirLoteResultadoSchema = z.object({
  excluidos: z.number().int(),
  /** Selecionados que ficaram por ter produto aplicável cadastrado. */
  comAplicacoes: z.number().int(),
});
export type EquipamentoExcluirLoteResultado = z.infer<
  typeof equipamentoExcluirLoteResultadoSchema
>;

export const equipamentoPopularResultadoSchema = z.object({
  /** Equipamentos criados agora. */
  criados: z.number().int(),
  /** Excluídos devolvidos ao cadastro (só com restaurarExcluidos). */
  restaurados: z.number().int(),
  /** Excluídos que continuaram excluídos. */
  excluidos: z.number().int(),
  /** Produtos de remessa que já estavam no cadastro, sem exclusão. */
  existentes: z.number().int(),
});
export type EquipamentoPopularResultado = z.infer<typeof equipamentoPopularResultadoSchema>;

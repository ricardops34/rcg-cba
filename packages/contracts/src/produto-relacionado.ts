import { z } from "zod";

/**
 * Produtos relacionados: similares e aplicação.
 *
 * O `tipo` é o que separa dois usos bem diferentes:
 *
 * - `similar` — um substitui o outro. **Simétrica**: gravada uma vez e lida
 *   dos dois lados.
 * - `aplicacao` — o produto usa o outro. É o caso do comodato (a dosadora
 *   emprestada e os químicos que ela dilui). **Direcional**, e por isso a tela
 *   mostra "Usa" de um lado e "Usado em" do outro.
 */

export const produtoRelacaoTipoSchema = z.enum(["similar", "aplicacao"]);
export type ProdutoRelacaoTipo = z.infer<typeof produtoRelacaoTipoSchema>;

/** Rótulos de cada ponta. Direcional só faz sentido com os dois. */
export const PRODUTO_RELACAO_LABEL: Record<
  ProdutoRelacaoTipo,
  { saindo: string; chegando: string }
> = {
  similar: { saindo: "Similares", chegando: "Similares" },
  aplicacao: { saindo: "Usa na aplicação", chegando: "Usado em" },
};

export const produtoRelacionadoSchema = z.object({
  id: z.string().uuid(),
  tipo: produtoRelacaoTipoSchema,
  /**
   * `false` quando a relação foi cadastrada do outro lado e estamos vendo a
   * volta. Só importa para `aplicacao`, onde o rótulo muda; em `similar` os
   * dois lados dizem a mesma coisa.
   */
  origem: z.boolean(),
  observacao: z.string().nullable(),
  ordem: z.number().int(),
  /** O **outro** produto da relação, seja ele a origem ou o destino. */
  produtoId: z.string().uuid(),
  codigoErp: z.string(),
  descricao: z.string(),
  unidade: z.string().nullable(),
  ativo: z.boolean(),
});
export type ProdutoRelacionado = z.infer<typeof produtoRelacionadoSchema>;

export const produtoRelacionadoCriarSchema = z.object({
  relacionadoId: z.string().uuid(),
  tipo: produtoRelacaoTipoSchema,
  observacao: z.string().trim().max(200).nullable().optional(),
  ordem: z.coerce.number().int().min(0).max(999).default(0),
});
export type ProdutoRelacionadoCriar = z.infer<
  typeof produtoRelacionadoCriarSchema
>;

export const PRODUTO_RELACIONADO_EXAMPLE: ProdutoRelacionado = {
  id: "3f2a9c1d-8b7e-4a56-9012-3c4d5e6f7a8b",
  tipo: "aplicacao",
  origem: true,
  observacao: "Dose de 20 ml por litro",
  ordem: 0,
  produtoId: "8a1b2c3d-4e5f-4061-9a2b-3c4d5e6f7081",
  codigoErp: "QUI-0042",
  descricao: "Detergente concentrado 5 L",
  unidade: "GL",
  ativo: true,
};

/**
 * Ficha técnica: o PDF do fabricante e o Markdown extraído dele.
 *
 * Os dois existem porque têm leitores diferentes — o PDF é para o vendedor
 * abrir e mandar ao cliente, o Markdown é o que a IA lê ao falar do produto.
 */
export const produtoFichaSchema = z.object({
  id: z.string().uuid(),
  produtoId: z.string().uuid(),
  titulo: z.string(),
  markdown: z.string(),
  /** Caminho público do PDF, para baixar. */
  url: z.string(),
  arquivoNome: z.string(),
  mime: z.string(),
  tamanho: z.number().int(),
  visivelAgente: z.boolean(),
  createdAt: z.string().datetime(),
});
export type ProdutoFicha = z.infer<typeof produtoFichaSchema>;

export const produtoFichaAtualizarSchema = z.object({
  titulo: z.string().trim().min(1).max(200).optional(),
  /**
   * Editável de propósito: é aqui que se retira do texto o que não deve chegar
   * ao modelo — tabela de preço do fabricante, por exemplo.
   */
  markdown: z.string().max(200_000).optional(),
  visivelAgente: z.boolean().optional(),
});
export type ProdutoFichaAtualizar = z.infer<typeof produtoFichaAtualizarSchema>;

/**
 * Importação em lote de fichas técnicas.
 *
 * O vínculo é pelo **conteúdo** do PDF, não pelo nome do arquivo: o modelo lê
 * o documento e devolve o que está escrito nele; quem procura no catálogo é o
 * servidor.
 */
export const fichaImportacaoSituacaoSchema = z.enum([
  "pendente",
  "processando",
  "vinculada",
  "sem_correspondencia",
  "ambiguo",
  "erro",
]);
export type FichaImportacaoSituacao = z.infer<
  typeof fichaImportacaoSituacaoSchema
>;

export const FICHA_IMPORTACAO_LABEL: Record<FichaImportacaoSituacao, string> = {
  pendente: "Na fila",
  processando: "Lendo o PDF",
  vinculada: "Vinculada",
  sem_correspondencia: "Produto não encontrado",
  ambiguo: "Mais de um produto",
  erro: "Falhou",
};

export const fichaImportacaoSchema = z.object({
  id: z.string().uuid(),
  arquivoNome: z.string(),
  tamanho: z.number().int(),
  situacao: fichaImportacaoSituacaoSchema,
  /** O que o modelo leu no documento — é o que explica por que ficou pendente. */
  codigoDetectado: z.string().nullable(),
  nomeDetectado: z.string().nullable(),
  titulo: z.string().nullable(),
  markdown: z.string().nullable(),
  produtoId: z.string().uuid().nullable(),
  produtoDescricao: z.string().nullable(),
  produtoCodigoErp: z.string().nullable(),
  fichaId: z.string().uuid().nullable(),
  erro: z.string().nullable(),
  createdAt: z.string().datetime(),
  processadoEm: z.string().datetime().nullable(),
});
export type FichaImportacao = z.infer<typeof fichaImportacaoSchema>;

/** Quantos ainda faltam, para a tela saber se continua acompanhando. */
export const fichaImportacaoResumoSchema = z.object({
  pendentes: z.number().int(),
  processando: z.number().int(),
  vinculadas: z.number().int(),
  precisamDecisao: z.number().int(),
  erros: z.number().int(),
});
export type FichaImportacaoResumo = z.infer<
  typeof fichaImportacaoResumoSchema
>;

export const fichaImportacaoVincularSchema = z.object({
  produtoId: z.string().uuid(),
});
export type FichaImportacaoVincular = z.infer<
  typeof fichaImportacaoVincularSchema
>;

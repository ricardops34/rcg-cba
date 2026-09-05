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

import type { Prisma } from '@prisma/client';

/**
 * Produto do catálogo "que se vende" (decisão do usuário, 17/11/2026):
 *
 * - categoria ativa (status do ERP) **e** marcada como Usada → o produto
 *   aparece, seja qual for a subcategoria;
 * - categoria fora disso → o produto só aparece se a **subcategoria** dele
 *   estiver ativa e marcada como Usada.
 *
 * É o filtro do seletor de produto do orçamento, de Comercial › Produtos e da
 * Consulta de Estoque — mudar aqui muda os três.
 */
export const PRODUTO_DE_CATEGORIA_ATIVA: Prisma.ProdutoWhereInput = {
  OR: [
    { categoria: { is: { ativo: true, usado: true } } },
    { subCategoria: { is: { ativo: true, usado: true } } },
  ],
};

import { Prisma } from '@prisma/client';

/**
 * O que conta como venda nas análises — Dashboard (Comercial e Gerencial),
 * Objetivos e Consultas.
 *
 * A regra vive aqui, e não em cada serviço, porque as três telas respondem à
 * mesma pergunta ("quanto foi vendido") e divergiam: as Consultas já
 * descartavam comodato e devolução, o Dashboard e os Objetivos somavam os
 * itens sem sequer olhar o cabeçalho da nota. Dois números para a mesma
 * pergunta é o tipo de coisa que ninguém percebe até a reunião de fechamento.
 *
 * O corte do cabeçalho:
 *
 * - `deletedAt`/`ativo` — nota cancelada no ERP fica de fora;
 * - `comodato = false` — remessa de comodato é empréstimo, não venda;
 * - `tipo = 'N'` (Normal) — exclui devolução ('D', CFOP 5915/5916/6202/6909…),
 *   beneficiamento ('B'), complemento ('C') e 'I';
 * - `condicaoPagamentoId IS NOT NULL` — a nota **Sem Financeiro**, que não
 *   gerou título. São remessas, bonificações e brindes: saem do estoque, não
 *   entram no faturamento. Elas vêm com valor zero, então não mexem em
 *   somatório — mas inflavam contagem de notas e de clientes positivados, que
 *   é onde o erro aparecia.
 *
 * `n` é sempre o alias do cabeçalho, mesmo quando a consulta agrega itens: é
 * o cabeçalho que diz o que o documento é.
 */
export const CONDICOES_NOTA_DE_VENDA_SQL: Prisma.Sql[] = [
  Prisma.sql`n."deletedAt" IS NULL`,
  Prisma.sql`n."ativo" = true`,
  Prisma.sql`n."comodato" = false`,
  Prisma.sql`n."tipo" = 'N'`,
  Prisma.sql`n."condicaoPagamentoId" IS NOT NULL`,
];

/** O mesmo corte de cabeçalho, para quem consulta pelo Prisma. */
export const NOTA_DE_VENDA_WHERE = {
  deletedAt: null,
  ativo: true,
  comodato: false,
  tipo: 'N',
  condicaoPagamentoId: { not: null },
} satisfies Prisma.NotaSaidaWhereInput;

/**
 * Junta a categoria do produto ao item, para o corte abaixo. Alias `cat`,
 * a partir do alias `i` do item.
 *
 * Só é preciso onde a consulta ainda não tem o produto na mão; quem já faz
 * `JOIN "produtos" p` liga a categoria direto em `p."categoriaId"`.
 */
export const JOIN_CATEGORIA_DO_ITEM_SQL = Prisma.sql`
  LEFT JOIN "produtos" prod_cat ON prod_cat."id" = i."produtoId"
  LEFT JOIN "categorias" cat ON cat."id" = prod_cat."categoriaId"`;

/**
 * O item que entra na análise.
 *
 * `cat."usado" IS DISTINCT FROM false` — a marcação "Usada nas análises" de
 * Cadastros > Categorias. Sai o que a empresa disse que **não** acompanha
 * (DESCONTINUADOS, SERVIÇOS, IMOBILIZADO, FRETE, CONSUMO, AMOSTRAS…), e não o
 * que ninguém marcou ainda: categoria em branco continua contando, senão
 * categoria nova nascia invisível e a venda sumia sem ninguém ter decidido
 * isso. `IS DISTINCT FROM` porque `<> false` não sobrevive ao nulo.
 */
export const CONDICOES_ITEM_DE_VENDA_SQL: Prisma.Sql[] = [
  Prisma.sql`i."deletedAt" IS NULL`,
  Prisma.sql`i."ativo" = true`,
  Prisma.sql`cat."usado" IS DISTINCT FROM false`,
];

/**
 * O mesmo item, para quem consulta pelo Prisma: linha viva, cabeçalho de
 * venda e categoria não recusada.
 *
 * O `NOT` é o equivalente do `IS DISTINCT FROM false`: exclui só quem tem
 * produto **com** categoria marcada como não usada — item sem produto ou de
 * categoria em branco passa.
 */
export const ITEM_DE_VENDA_WHERE = {
  deletedAt: null,
  ativo: true,
  notaSaida: { is: NOTA_DE_VENDA_WHERE },
  NOT: { produto: { is: { categoria: { is: { usado: false } } } } },
} satisfies Prisma.NotaSaidaItemWhereInput;

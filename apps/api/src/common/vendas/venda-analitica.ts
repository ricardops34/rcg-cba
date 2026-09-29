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
 * - **a nota gerou duplicata** (`geraDuplicata`, o F2_DUPL do ERP). É o que
 *   separa venda de remessa: a nota de comodato, de bonificação ou de
 *   transferência sai do estoque sem gerar financeiro. Se a nota gerou
 *   duplicata, **todos** os itens dela contam — inclusive um item de comodato
 *   que foi junto na nota de venda —, e se não gerou, nenhum conta. É a regra
 *   do sistema que a plataforma substituiu, conferida no ERP em 2026-09-29: com
 *   ela, 10 de 11 vendedores bateram ao centavo (o 11º era erro do sistema
 *   anterior com uma nota excluída e reemitida).
 *
 *   Até então o critério era `condicaoPagamentoId IS NOT NULL`, e ele não
 *   separa: a nota de comodato da RCG tem condição de pagamento. Continua
 *   valendo **só** para a nota com `geraDuplicata` nulo — a que chegou por uma
 *   integração que ainda não mandava o F2_DUPL.
 * - `serie IN (...)` — só as séries do parâmetro `VENDAS_SERIES_NOTA`, quando
 *   preenchido. Esse corte depende da empresa, então não mora nas constantes
 *   abaixo: entra por `corteDeVenda`, no fim do arquivo.
 *
 * `n` é sempre o alias do cabeçalho, mesmo quando a consulta agrega itens: é
 * o cabeçalho que diz o que o documento é.
 *
 * As constantes não são exportadas: quem apura venda usa `corteDeVenda`, que
 * já traz as séries. Um serviço que montasse o corte sem elas voltaria a
 * contar o que a empresa excluiu, e as telas deixariam de bater entre si.
 */
const CONDICOES_NOTA_DE_VENDA_SQL: Prisma.Sql[] = [
  Prisma.sql`n."deletedAt" IS NULL`,
  Prisma.sql`n."ativo" = true`,
  Prisma.sql`n."comodato" = false`,
  Prisma.sql`n."tipo" = 'N'`,
  Prisma.sql`(n."geraDuplicata" = true OR (n."geraDuplicata" IS NULL AND n."condicaoPagamentoId" IS NOT NULL))`,
];

/**
 * O mesmo corte de cabeçalho, para quem consulta pelo Prisma. O `OR` da
 * duplicata vai num `AND` para não colidir com um `OR` que quem chama espalhe
 * no mesmo where.
 */
const NOTA_DE_VENDA_WHERE = {
  deletedAt: null,
  ativo: true,
  comodato: false,
  tipo: 'N',
  AND: [
    {
      OR: [
        { geraDuplicata: true },
        { geraDuplicata: null, condicaoPagamentoId: { not: null } },
      ],
    },
  ],
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
 * O item que entra na análise — **dentro** de uma nota de venda.
 *
 * `cat."usado" IS DISTINCT FROM false` — a marcação "Usada nas análises" de
 * Cadastros > Categorias. Sai o que a empresa disse que **não** acompanha
 * (DESCONTINUADOS, SERVIÇOS, IMOBILIZADO, FRETE, CONSUMO, AMOSTRAS…), e não o
 * que ninguém marcou ainda: categoria em branco continua contando, senão
 * categoria nova nascia invisível e a venda sumia sem ninguém ter decidido
 * isso. `IS DISTINCT FROM` porque `<> false` não sobrevive ao nulo.
 *
 * A categoria filtra só entre as vendas: o comodato já saiu pela duplicata.
 * Por isso uma categoria como SABONETEIRAS/DISPENSER'S — desmarcada quando o
 * comodato de dispenser entrava como venda — pode ser marcada de novo, e a
 * venda de dispenser passa a contar.
 */
const CONDICOES_ITEM_DE_VENDA_SQL: Prisma.Sql[] = [
  Prisma.sql`i."deletedAt" IS NULL`,
  Prisma.sql`i."ativo" = true`,
  Prisma.sql`cat."usado" IS DISTINCT FROM false`,
];

/**
 * O mesmo item, para quem consulta pelo Prisma: linha viva e categoria não
 * recusada. O cabeçalho de venda entra em `montarCorteDeVenda`.
 *
 * O equivalente do `IS DISTINCT FROM false` é escrito **pelo lado de quem
 * passa**: item sem produto, produto sem categoria, ou categoria com `usado`
 * verdadeiro **ou nulo**. Não use `NOT: { ... usado: false }`: o Prisma gera
 * `NOT (usado = false)`, que com `usado` nulo dá nulo e descarta o item em
 * silêncio. Foi assim até 2026-09-29, e a categoria PECAS — que está em branco
 * no cadastro — sumia do Dashboard (R$ 10.656,00 do vendedor PECAS em
 * 09/2026) enquanto as Consultas, em SQL, a contavam.
 */
const CATEGORIA_ACOMPANHADA_WHERE = {
  OR: [
    { produtoId: null },
    { produto: { is: { categoriaId: null } } },
    {
      produto: {
        is: { categoria: { is: { OR: [{ usado: null }, { usado: true }] } } },
      },
    },
  ],
} satisfies Prisma.NotaSaidaItemWhereInput;

const CONDICOES_DO_ITEM_WHERE = {
  deletedAt: null,
  ativo: true,
} satisfies Prisma.NotaSaidaItemWhereInput;

/**
 * Parâmetro da empresa com as séries de nota de saída que contam como venda,
 * separadas por vírgula (ex.: `1` ou `1,3`). Vazio = todas.
 *
 * A série diz qual documento o ERP emitiu: na RCG a série 1 é a NF-e de
 * mercadoria (SPED) e a série 3 é o RPS de serviço. A integração traz as duas
 * (`F2_SERIE IN ('1','3')` no BJPLA003), porque a nota de serviço precisa
 * estar na base para a Posição do Cliente. O RPS gera duplicata, então a
 * duplicata não o separa: se o serviço entra no realizado é decisão comercial
 * da empresa, e o sistema anterior apurava só a série 1.
 */
export const PARAMETRO_SERIES_DE_VENDA = 'VENDAS_SERIES_NOTA';

/** `"1, 3"` → `['1', '3']`; vazio ou nulo → `null` (sem corte). */
export function lerLista(conteudo: string | null | undefined): string[] | null {
  const valores = (conteudo ?? '').split(/[,;\s]+/).filter((s) => s !== '');
  return valores.length > 0 ? [...new Set(valores)] : null;
}

/**
 * O que é venda para **esta empresa**: o corte fixo acima mais as séries.
 * Duas formas do mesmo corte: `nota` e `item` para quem consulta pelo
 * Prisma; `notaSql` (alias `n`) e `itemSql` (alias `i`, com a categoria em
 * `cat`) para quem escreve SQL.
 */
export type CorteDeVenda = {
  nota: Prisma.NotaSaidaWhereInput;
  item: Prisma.NotaSaidaItemWhereInput;
  notaSql: Prisma.Sql[];
  itemSql: Prisma.Sql[];
};

export type ParametrosDeVenda = {
  series: string[] | null;
};

export function montarCorteDeVenda({
  series,
}: ParametrosDeVenda): CorteDeVenda {
  const nota: Prisma.NotaSaidaWhereInput = series
    ? { ...NOTA_DE_VENDA_WHERE, serie: { in: series } }
    : { ...NOTA_DE_VENDA_WHERE };

  // A categoria vai num `AND` para não colidir com um `OR` que quem chama
  // espalhe no mesmo where.
  const item: Prisma.NotaSaidaItemWhereInput = {
    ...CONDICOES_DO_ITEM_WHERE,
    notaSaida: { is: nota },
    AND: [CATEGORIA_ACOMPANHADA_WHERE],
  };

  return {
    nota,
    item,
    notaSql: series
      ? [
          ...CONDICOES_NOTA_DE_VENDA_SQL,
          Prisma.sql`n."serie" IN (${Prisma.join(series)})`,
        ]
      : [...CONDICOES_NOTA_DE_VENDA_SQL],
    itemSql: [...CONDICOES_ITEM_DE_VENDA_SQL],
  };
}

/**
 * Lê as séries da empresa e monta o corte. Lê a tabela direto, na transação
 * de quem chama, em vez de passar pelo `ParametrosService`: assim qualquer
 * serviço que apura venda consegue o corte sem depender de mais um provider.
 */
export async function corteDeVenda(
  tx: Prisma.TransactionClient,
  empresaId: string,
): Promise<CorteDeVenda> {
  const parametro = await tx.parametroEmpresa.findFirst({
    where: {
      empresaId,
      parametro: PARAMETRO_SERIES_DE_VENDA,
      ativo: true,
      deletedAt: null,
    },
    select: { conteudo: true },
  });
  return montarCorteDeVenda({ series: lerLista(parametro?.conteudo) });
}

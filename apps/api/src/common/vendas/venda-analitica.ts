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
  Prisma.sql`n."condicaoPagamentoId" IS NOT NULL`,
];

/** O mesmo corte de cabeçalho, para quem consulta pelo Prisma. */
const NOTA_DE_VENDA_WHERE = {
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
 *
 * O corte de CFOP depende da empresa e entra por `corteDeVenda`.
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
 * O `NOT` é o equivalente do `IS DISTINCT FROM false`: exclui só quem tem
 * produto **com** categoria marcada como não usada — item sem produto ou de
 * categoria em branco passa.
 */
const CONDICOES_DO_ITEM_WHERE = {
  deletedAt: null,
  ativo: true,
  NOT: { produto: { is: { categoria: { is: { usado: false } } } } },
} satisfies Prisma.NotaSaidaItemWhereInput;

/**
 * Parâmetro da empresa com as séries de nota de saída que contam como venda,
 * separadas por vírgula (ex.: `1` ou `1,3`). Vazio = todas.
 *
 * A série diz qual documento o ERP emitiu: na RCG a série 1 é a NF-e de
 * mercadoria (SPED) e a série 3 é o RPS de serviço. A integração traz as duas
 * (`F2_SERIE IN ('1','3')` no BJPLA003), porque a nota de serviço precisa
 * estar na base para a Posição do Cliente. Se o serviço entra no realizado é
 * decisão comercial da empresa, não do ERP. O sistema que a plataforma
 * substituiu apurava só a série 1, e foi essa a diferença que o Dashboard
 * Gerencial mostrou em 2026-09-29.
 */
export const PARAMETRO_SERIES_DE_VENDA = 'VENDAS_SERIES_NOTA';

/**
 * Parâmetro da empresa com os CFOPs de **item** que não contam como venda,
 * separados por vírgula. Vazio = nenhum excluído.
 *
 * O corte de comodato do cabeçalho (`comodato = false`) não basta: o ERP
 * emite a remessa em comodato (5908/6908) e a bonificação (5910/6910) como
 * itens **dentro** da nota de venda, e o cabeçalho nunca vem marcado. Na
 * conferência de 2026-09-29 com o sistema anterior, esses itens eram toda a
 * diferença de ESCRITORIO, JOSUE, RUBENS e JOAO.
 */
export const PARAMETRO_CFOPS_EXCLUIDOS = 'VENDAS_CFOPS_EXCLUIDOS';

/** `"1, 3"` → `['1', '3']`; vazio ou nulo → `null` (sem corte). */
export function lerLista(conteudo: string | null | undefined): string[] | null {
  const valores = (conteudo ?? '').split(/[,;\s]+/).filter((s) => s !== '');
  return valores.length > 0 ? [...new Set(valores)] : null;
}

/**
 * O que é venda para **esta empresa**: o corte fixo acima mais os parâmetros.
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
  cfopsExcluidos: string[] | null;
};

export function montarCorteDeVenda({
  series,
  cfopsExcluidos,
}: ParametrosDeVenda): CorteDeVenda {
  const nota: Prisma.NotaSaidaWhereInput = series
    ? { ...NOTA_DE_VENDA_WHERE, serie: { in: series } }
    : { ...NOTA_DE_VENDA_WHERE };

  // Item sem CFOP continua contando: `NOT IN` sozinho descartaria o nulo em
  // silêncio, no SQL e no Prisma. Vai num `AND` para não colidir com um `OR`
  // que quem chama espalhe no mesmo where.
  const item: Prisma.NotaSaidaItemWhereInput = {
    ...CONDICOES_DO_ITEM_WHERE,
    notaSaida: { is: nota },
    ...(cfopsExcluidos
      ? {
          AND: [{ OR: [{ cfop: null }, { cfop: { notIn: cfopsExcluidos } }] }],
        }
      : {}),
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
    itemSql: cfopsExcluidos
      ? [
          ...CONDICOES_ITEM_DE_VENDA_SQL,
          Prisma.sql`(i."cfop" IS NULL OR i."cfop" NOT IN (${Prisma.join(cfopsExcluidos)}))`,
        ]
      : [...CONDICOES_ITEM_DE_VENDA_SQL],
  };
}

/**
 * Lê os parâmetros da empresa e monta o corte. Lê a tabela direto, na
 * transação de quem chama, em vez de passar pelo `ParametrosService`: assim
 * qualquer serviço que apura venda consegue o corte sem depender de mais um
 * provider.
 */
export async function corteDeVenda(
  tx: Prisma.TransactionClient,
  empresaId: string,
): Promise<CorteDeVenda> {
  const parametros = await tx.parametroEmpresa.findMany({
    where: {
      empresaId,
      parametro: { in: [PARAMETRO_SERIES_DE_VENDA, PARAMETRO_CFOPS_EXCLUIDOS] },
      ativo: true,
      deletedAt: null,
    },
    select: { parametro: true, conteudo: true },
  });
  const conteudo = (nome: string) =>
    parametros.find((p) => p.parametro === nome)?.conteudo;
  return montarCorteDeVenda({
    series: lerLista(conteudo(PARAMETRO_SERIES_DE_VENDA)),
    cfopsExcluidos: lerLista(conteudo(PARAMETRO_CFOPS_EXCLUIDOS)),
  });
}

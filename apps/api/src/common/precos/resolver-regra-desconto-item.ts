import type { TenantTx } from '../prisma/prisma.service';

/**
 * Regra de desconto que vale para um item, com as faixas e os limites — é o
 * que o cálculo de comissão precisa.
 */
export interface RegraDoItem {
  id: string;
  codigoErp: string | null;
  descricao: string;
  percDescontoMaximo: number;
  percDescontoAutorizado: number;
  faixas: {
    sequencia: number;
    percInicial: number;
    percFinal: number;
    percBaseComissao: number;
  }[];
}

const SELECT = {
  id: true,
  codigoErp: true,
  descricao: true,
  percDescontoMaximo: true,
  percDescontoAutorizado: true,
  faixas: {
    where: { deletedAt: null },
    orderBy: { sequencia: 'asc' as const },
    select: {
      sequencia: true,
      percInicial: true,
      percFinal: true,
      percBaseComissao: true,
    },
  },
};

/**
 * Resolve a regra de desconto de um produto seguindo a precedência combinada
 * com o comercial, do mais específico para o mais genérico:
 *
 * 1. item da **tabela de preço** do cliente (sobrepõe o produto);
 * 2. **produto** (sobrepõe a categoria);
 * 3. **categoria** do produto;
 * 4. **regra padrão** da empresa, quando nenhum dos três tem vínculo.
 *
 * Devolve null só quando nem regra padrão existe. Resolve um lote de produtos
 * de uma vez porque o uso é por orçamento inteiro — quatro consultas no total,
 * não quatro por item.
 */
export async function resolverRegrasDescontoDosItens(
  tx: TenantTx,
  empresaId: string,
  produtoIds: string[],
  tabelaPrecoId: string | null,
): Promise<Map<string, RegraDoItem | null>> {
  const resultado = new Map<string, RegraDoItem | null>();
  const ids = [...new Set(produtoIds)];
  if (ids.length === 0) return resultado;

  const [itensTabela, produtos, padrao] = await Promise.all([
    tabelaPrecoId
      ? tx.tabelaPrecoItem.findMany({
          where: {
            tabelaPrecoId,
            produtoId: { in: ids },
            deletedAt: null,
            regraDescontoId: { not: null },
          },
          select: { produtoId: true, regraDesconto: { select: SELECT } },
        })
      : Promise.resolve(
          [] as { produtoId: string; regraDesconto: RegraDoItem | null }[],
        ),
    tx.produto.findMany({
      where: { id: { in: ids }, empresaId },
      select: {
        id: true,
        regraDesconto: { select: SELECT },
        categoria: { select: { regraDesconto: { select: SELECT } } },
      },
    }),
    tx.regraDesconto.findFirst({
      where: { empresaId, padrao: true, ativo: true, deletedAt: null },
      select: SELECT,
    }),
  ]);

  const porTabela = new Map(
    itensTabela
      .filter((i) => i.regraDesconto)
      .map((i) => [i.produtoId, i.regraDesconto as RegraDoItem]),
  );

  for (const produto of produtos) {
    resultado.set(
      produto.id,
      porTabela.get(produto.id) ??
        produto.regraDesconto ??
        produto.categoria?.regraDesconto ??
        padrao ??
        null,
    );
  }
  // Produto que não existe mais (ou de outra empresa) fica sem regra.
  for (const id of ids)
    if (!resultado.has(id)) resultado.set(id, padrao ?? null);

  return resultado;
}

import { BadRequestException } from '@nestjs/common';
import type { TenantTx } from '../../common/prisma/prisma.service';
import {
  calcularComissaoItem,
  type OrcamentoItemLinha,
} from '@plataforma/contracts';
import { resolverTabelaPrecoCliente } from '../../common/precos/resolver-tabela-preco-cliente';
import { resolverRegrasDescontoDosItens } from '../../common/precos/resolver-regra-desconto-item';

/**
 * Resolve vlrTabela de cada item na Tabela de Preço que vale pro cliente
 * (ver resolverTabelaPrecoCliente — cai na tabela padrão de capital/interior
 * quando a do cadastro está vazia ou inativa) e calcula desconto/total a
 * partir do vlrUnitario informado (editável por linha). Sem tabela aplicável,
 * ou sem preço cadastrado pro produto, vlrTabela fica null — o vlrUnitario
 * informado é usado do mesmo jeito, sem desconto calculado.
 *
 * Também apura, por linha, a regra de desconto aplicável (tabela de preço >
 * produto > categoria > regra padrão) e a comissão resultante: o percentual
 * do vendedor é a base, e a faixa em que o desconto caiu diz quanto dessa base
 * ele recebe. Desconto acima do limite da regra **não** bloqueia a gravação —
 * só aparece como aviso na tela.
 *
 * Compartilhado entre OrcamentosService (tela) e IntegracaoOrcamentosService
 * (API externa).
 */
export async function calcularItensOrcamento(
  tx: TenantTx,
  empresaId: string,
  clienteId: string,
  itens: OrcamentoItemLinha[],
  vendedorId: string,
  /** Parâmetro DESCONTO_ACIMA_LIMITE_BLOQUEIA da empresa. */
  bloquearAcimaDoLimite = false,
) {
  if (itens.length === 0)
    return { data: [] as Record<string, unknown>[], vlrTotal: 0 };

  const produtoIds = itens.map((i) => i.produtoId);
  const tabelaPrecoId = await resolverTabelaPrecoCliente(
    tx,
    empresaId,
    clienteId,
  );

  const [precos, regrasPorProduto, vendedor] = await Promise.all([
    tabelaPrecoId
      ? tx.tabelaPrecoItem.findMany({
          where: {
            tabelaPrecoId,
            produtoId: { in: produtoIds },
            deletedAt: null,
          },
          select: { produtoId: true, preco: true },
        })
      : Promise.resolve([] as { produtoId: string; preco: number }[]),
    resolverRegrasDescontoDosItens(tx, empresaId, produtoIds, tabelaPrecoId),
    tx.vendedor.findFirst({
      where: { id: vendedorId, empresaId },
      select: { percComissao: true },
    }),
  ]);
  const precoPorProduto = new Map(precos.map((p) => [p.produtoId, p.preco]));
  // Sem % base no cadastro do vendedor não há como apurar: a comissão da
  // linha fica null (não apurada), e não zero.
  const percBaseVendedor = vendedor?.percComissao ?? null;

  let vlrTotalOrcamento = 0;
  const data = itens.map((item) => {
    const vlrTabela = precoPorProduto.get(item.produtoId) ?? null;
    const vlrDesconto =
      vlrTabela != null && vlrTabela > item.vlrUnitario
        ? Math.round((vlrTabela - item.vlrUnitario) * item.quantidade * 100) /
          100
        : 0;
    const percDesconto = vlrTabela
      ? Math.round(((vlrTabela - item.vlrUnitario) / vlrTabela) * 10000) / 100
      : null;
    const vlrTotalItem =
      Math.round(item.vlrUnitario * item.quantidade * 100) / 100;
    vlrTotalOrcamento += vlrTotalItem;

    const regra = regrasPorProduto.get(item.produtoId) ?? null;
    const comissao = calcularComissaoItem(
      regra,
      percDesconto,
      percBaseVendedor,
    );
    // Com o parâmetro ligado, desconto acima do limite da regra recusa a
    // gravação em vez de só avisar na tela.
    if (bloquearAcimaDoLimite && comissao.acimaDoMaximo) {
      throw new BadRequestException(
        `Desconto de ${percDesconto}% excede o máximo de ` +
          `${regra?.percDescontoMaximo}% da regra ${regra?.descricao}`,
      );
    }

    return {
      empresaId,
      produtoId: item.produtoId,
      quantidade: item.quantidade,
      vlrTabela,
      vlrUnitario: item.vlrUnitario,
      percDesconto,
      vlrDesconto,
      vlrTotal: vlrTotalItem,
      // Valor vindo da API de integração prevalece: naquele caminho o ERP é
      // dono do número. Pela tela nada é informado, então vale o cálculo.
      regraDescontoId: item.regraDescontoId ?? regra?.id ?? null,
      percComissao: item.percComissao ?? comissao.percComissao,
    };
  });
  return { data, vlrTotal: Math.round(vlrTotalOrcamento * 100) / 100 };
}

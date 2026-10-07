import type { TenantTx } from '../../../common/prisma/prisma.service';

/**
 * Comodato marcado pelo CFOP do item, e não só pelo que o ERP informa.
 *
 * O Protheus nunca mandou `comodato` (conferido em 2026-10-06: falso nas 113
 * mil notas de saída, inclusive nas 5 mil remessas), mas o CFOP é o que a lei
 * exige no documento e não falha:
 *
 * - 5908/6908 — remessa de bem em comodato (nota de saída);
 * - 1909/2909 — retorno do bem remetido em comodato (nota de entrada, tipo 'D').
 *
 * Ficam de fora 1908/2908 e 5909/6909: são o comodato **recebido** de
 * fornecedor e a devolução dele, e não o equipamento que a empresa empresta ao
 * cliente.
 *
 * A mesma lista está na migration `20261007030000_comodato_por_cfop`, que
 * marcou o histórico. Mudar uma sem a outra deixa a nota antiga e a nova com
 * regras diferentes.
 */
export const CFOPS_REMESSA_COMODATO = ['5908', '6908'];
export const CFOPS_RETORNO_COMODATO = ['1909', '2909'];

/** O ERP informou, ou o CFOP é de comodato. */
export function itemEhComodato(
  cfop: string | null | undefined,
  cfops: string[],
  informado = false,
): boolean {
  return informado || cfops.includes(cfop?.trim() ?? '');
}

/**
 * Recalcula `comodato` do cabeçalho depois que os itens foram gravados.
 *
 * A nota é de comodato quando **todos** os itens vivos são. Nota mista — a
 * venda que levou um dispenser em comodato junto — continua sendo venda: as
 * análises tiram a nota inteira quando o cabeçalho é comodato (ver
 * `common/vendas/venda-analitica.ts`), e a venda sumiria junto.
 *
 * Roda sobre o banco, e não sobre o payload, porque o item que não vem no
 * envio não é excluído (ver `sincronizarFilhos`): os itens do payload podem
 * ser só parte da nota. Nota sem item nenhum fica com o que foi informado.
 *
 * Devolve se mudou, para quem chamou reler o registro antes de responder.
 */
export async function recalcularComodatoDaNota(
  tx: TenantTx,
  nota: 'saida' | 'entrada',
  id: string,
  informado = false,
): Promise<boolean> {
  const where = { deletedAt: null, ativo: true };
  const [atual, itens] =
    nota === 'saida'
      ? await Promise.all([
          tx.notaSaida.findUniqueOrThrow({
            where: { id },
            select: { comodato: true },
          }),
          tx.notaSaidaItem.findMany({
            where: { ...where, notaSaidaId: id },
            select: { comodato: true },
          }),
        ])
      : await Promise.all([
          tx.notaEntrada.findUniqueOrThrow({
            where: { id },
            select: { comodato: true },
          }),
          tx.notaEntradaItem.findMany({
            where: { ...where, notaEntradaId: id },
            select: { comodato: true },
          }),
        ]);
  const comodato =
    informado || (itens.length > 0 && itens.every((i) => i.comodato));
  if (comodato === atual.comodato) return false;
  if (nota === 'saida') {
    await tx.notaSaida.update({ where: { id }, data: { comodato } });
  } else {
    await tx.notaEntrada.update({ where: { id }, data: { comodato } });
  }
  return true;
}

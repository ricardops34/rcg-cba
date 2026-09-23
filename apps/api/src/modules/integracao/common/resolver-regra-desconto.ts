import { ConflictException, NotFoundException } from '@nestjs/common';
import type { TenantTx } from '../../../common/prisma/prisma.service';

/**
 * Traduz a chave natural da regra no id interno. Para payloads legados, que
 * enviavam apenas Z0_CODIGO, faz fallback por `codigoErp` quando ele identifica
 * uma única regra na empresa. Código desconhecido ou ambíguo falha alto em vez
 * de gravar o vínculo vazio/em uma filial arbitrária.
 *
 * Devolve `undefined` quando o campo não veio no payload — assim um PATCH
 * parcial não apaga o vínculo existente; `null` explícito limpa.
 */
export async function resolverRegraDesconto(
  tx: TenantTx,
  empresaId: string,
  codigo: string | null | undefined,
): Promise<string | null | undefined> {
  if (codigo === undefined) return undefined;
  if (codigo === null || codigo.trim() === '') return null;

  const valor = codigo.trim();
  const regraPorChave = await tx.regraDesconto.findFirst({
    where: { empresaId, chave: valor, deletedAt: null },
    select: { id: true },
  });
  if (regraPorChave) return regraPorChave.id;

  const regrasPorCodigo = await tx.regraDesconto.findMany({
    where: { empresaId, codigoErp: valor, deletedAt: null },
    select: { id: true, chave: true },
    take: 2,
  });
  if (regrasPorCodigo.length > 1) {
    throw new ConflictException(
      `regraDescontoCodigo '${codigo}' identifica mais de uma regra; envie regraDescontoChave com a filial`,
    );
  }
  if (regrasPorCodigo.length === 0) {
    throw new NotFoundException(
      `regraDescontoChave '${codigo}' não encontrado`,
    );
  }
  return regrasPorCodigo[0].id;
}

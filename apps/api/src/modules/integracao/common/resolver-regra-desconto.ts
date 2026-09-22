import { NotFoundException } from '@nestjs/common';
import type { TenantTx } from '../../../common/prisma/prisma.service';

/**
 * Traduz o `regraDescontoChave` que o ERP envia (Z0_CODIGO) no id interno da
 * regra, no mesmo padrão dos demais códigos da API de integração
 * (clienteChave, produtoChave…). Código desconhecido falha alto em vez de
 * gravar o vínculo vazio em silêncio.
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

  const regra = await tx.regraDesconto.findFirst({
    where: { empresaId, chave: codigo.trim(), deletedAt: null },
    select: { id: true },
  });
  if (!regra) {
    throw new NotFoundException(
      `regraDescontoChave '${codigo}' não encontrado`,
    );
  }
  return regra.id;
}

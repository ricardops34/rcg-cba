import { NotFoundException } from '@nestjs/common';
import type { TenantTx } from '../../../common/prisma/prisma.service';

/**
 * Traduz o `produtoChave` enviado pelo ERP no id do Produto.
 *
 * Busca flexível por:
 * 1. `chave` exata ou sem espaços nas pontas
 * 2. `codigoErp` exato ou sem espaços nas pontas
 * 3. Substring contida no `codigoErp` ou na `chave` (caso o Protheus envie com espaços de alinhamento)
 */
export async function resolverProduto(
  tx: TenantTx,
  empresaId: string,
  produtoChave: string,
): Promise<{ id: string; chave: string }> {
  const raw = produtoChave ?? '';
  const trimmed = raw.trim();

  let produto = await tx.produto.findFirst({
    where: {
      empresaId,
      deletedAt: null,
      OR: [
        { chave: raw },
        { chave: trimmed },
        { codigoErp: raw },
        { codigoErp: trimmed },
      ],
    },
    select: { id: true, chave: true },
  });

  if (!produto && trimmed.length > 0) {
    produto = await tx.produto.findFirst({
      where: {
        empresaId,
        deletedAt: null,
        OR: [
          { chave: { contains: trimmed, mode: 'insensitive' } },
          { codigoErp: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      select: { id: true, chave: true },
    });
  }

  if (!produto) {
    throw new NotFoundException(`produtoChave '${produtoChave}' não encontrado`);
  }

  return { id: produto.id, chave: produto.chave ?? trimmed };
}

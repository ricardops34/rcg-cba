import { NotFoundException } from '@nestjs/common';
import type { TenantTx } from '../../../common/prisma/prisma.service';

/**
 * Traduz o `produtoChave` enviado pelo ERP no id do Produto.
 *
 * Só **igualdade**, na ordem em que o ERP identifica o produto:
 * 1. `chave` (com e sem espaços nas pontas — o Protheus alinha campo com espaço);
 * 2. `codigoErp`, igualmente.
 *
 * Havia um terceiro passo, "contém" em `chave` e `codigoErp`, e ele ligava o
 * item ao produto **errado** sem avisar: a chave `1` achava qualquer produto
 * cujo código tivesse um `1`, e `findFirst` sem ordem escolhia um ao acaso. Chave
 * que não existe é 404 — o ERP vê o erro e corrige, em vez de gravar o preço ou
 * o estoque no produto de outro.
 */
export async function resolverProduto(
  tx: TenantTx,
  empresaId: string,
  produtoChave: string,
): Promise<{ id: string; chave: string }> {
  const raw = produtoChave ?? '';
  const trimmed = raw.trim();
  const valores = [...new Set([raw, trimmed])].filter((v) => v.length > 0);

  const onde = { empresaId, deletedAt: null };
  const select = { id: true, chave: true } as const;

  if (valores.length > 0) {
    const porChave = await tx.produto.findFirst({
      where: { ...onde, chave: { in: valores } },
      select,
      orderBy: { id: 'asc' },
    });
    const produto =
      porChave ??
      (await tx.produto.findFirst({
        where: { ...onde, codigoErp: { in: valores } },
        select,
        orderBy: { id: 'asc' },
      }));
    if (produto) return { id: produto.id, chave: produto.chave ?? trimmed };
  }

  throw new NotFoundException(`produtoChave '${produtoChave}' não encontrado`);
}

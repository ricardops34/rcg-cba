import { NotFoundException } from '@nestjs/common';
import type { TenantTx } from '../../../common/prisma/prisma.service';

/**
 * Traduz o `vendedorChave` enviado pelo ERP no ID do Vendedor.
 *
 * Suporta vendedores, supervisores, gerentes e diretores.
 * Busca flexível por:
 * 1. `chave` exata ou trimmed (ex: "01-00312", "  -00312")
 * 2. `codigoErp` exato ou trimmed (ex: "00312")
 * 3. Sufixo da `chave` após o hífen de filial (ex: "chave" terminando com "-00312")
 */
export async function resolverVendedor(
  tx: TenantTx,
  empresaId: string,
  vendedorChave: string | null | undefined,
): Promise<string | null> {
  if (!vendedorChave) return null;

  const raw = vendedorChave;
  const trimmed = raw.trim();
  const codigoLimpo = trimmed.replace(/^-+/, '').trim();

  const vendedor = await tx.vendedor.findFirst({
    where: {
      empresaId,
      deletedAt: null,
      OR: [
        { chave: raw },
        { chave: trimmed },
        { codigoErp: raw },
        { codigoErp: trimmed },
        { codigoErp: codigoLimpo },
        ...(codigoLimpo ? [{ chave: { endsWith: `-${codigoLimpo}` } }] : []),
        ...(codigoLimpo ? [{ chave: codigoLimpo }] : []),
      ],
    },
    select: { id: true },
  });

  if (!vendedor) {
    throw new NotFoundException(
      `vendedorChave '${vendedorChave}' não encontrado`,
    );
  }

  return vendedor.id;
}

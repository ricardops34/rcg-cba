import { NotFoundException } from '@nestjs/common';
import type { TenantTx } from '../../../common/prisma/prisma.service';

/**
 * Traduz o `clienteChave` enviado pelo ERP no ID do Cliente.
 *
 * Busca flexível por:
 * 1. `chave` exata ou trimmed (ex: "01-001953-01", "  -001953-01")
 * 2. `codigoErp` exato ou trimmed (ex: "00195301")
 * 3. Sufixo da `chave` após o hífen de filial (ex: "chave" terminando com "-001953-01")
 */
export async function resolverCliente(
  tx: TenantTx,
  empresaId: string,
  clienteChave: string | null | undefined,
): Promise<string | null> {
  if (!clienteChave) return null;

  const raw = clienteChave;
  const trimmed = raw.trim();
  const codigoLimpo = trimmed.replace(/^-+/, '').trim();

  const cliente = await tx.cliente.findFirst({
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

  if (!cliente) {
    throw new NotFoundException(
      `clienteChave '${clienteChave}' não encontrado`,
    );
  }

  return cliente.id;
}

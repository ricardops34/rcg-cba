import type { TenantTx } from '../../common/prisma/prisma.service';
import { carregarCalendarioUtil } from '../../common/horario/calendario-util';

/** Mantém dias corridos do prazo; somente o último dia passa ao próximo dia útil. */
export async function ajustarValidadeOrcamento(
  tx: TenantTx,
  empresaId: string,
  data: Date | null | undefined,
) {
  if (data == null) return data;
  const calendario = await carregarCalendarioUtil(tx, empresaId);
  return calendario.ajustar(data, true);
}

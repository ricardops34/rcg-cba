import { randomUUID } from 'node:crypto';
import type { TenantTx } from '../../common/prisma/prisma.service';

/**
 * Reserva o próximo número do orçamento (sequencial por empresa, o "Nº" que
 * sai na proposta em PDF) incrementando o contador de `orcamento_config`.
 *
 * O `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` resolve leitura e
 * incremento numa única instrução atômica: duas criações simultâneas na mesma
 * empresa serializam no lock da linha do contador, então nunca saem com o
 * mesmo número (o unique `(empresaId, numero)` é a rede de segurança). O
 * INSERT cobre a empresa que ainda não tem config — o `diasValidade` fica no
 * default, o mesmo que o resto do código já assume quando não há registro.
 *
 * Compartilhado entre OrcamentosService (tela) e IntegracaoOrcamentosService
 * (API externa), como `calcularItensOrcamento`.
 */
export async function proximoNumeroOrcamento(
  tx: TenantTx,
  empresaId: string,
): Promise<number> {
  const linhas = await tx.$queryRaw<{ ultimoNumero: number }[]>`
    INSERT INTO "orcamento_config" ("id", "empresaId", "ultimoNumero", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${empresaId}, 1, now(), now())
    ON CONFLICT ("empresaId")
      DO UPDATE SET "ultimoNumero" = "orcamento_config"."ultimoNumero" + 1
    RETURNING "ultimoNumero"
  `;
  return linhas[0].ultimoNumero;
}

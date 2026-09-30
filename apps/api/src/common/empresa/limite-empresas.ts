import { ForbiddenException } from '@nestjs/common';
import type { TenantTx } from '../prisma/prisma.service';

/** Deve ser executado na mesma transação que cria/move a empresa. */
export async function garantirVagaDeEmpresa(
  tx: TenantTx,
  grupoId: string,
  totalApos?: number,
) {
  // Serializa cadastros simultâneos, inclusive quando ainda não há empresas.
  await tx.$queryRaw`SELECT id FROM grupos_economicos WHERE id = ${grupoId} FOR UPDATE`;
  const assinatura = await tx.assinatura.findUnique({
    where: { grupoEconomicoId: grupoId },
    include: { plano: true },
  });
  if (
    !assinatura ||
    !['ativa', 'teste'].includes(assinatura.situacao) ||
    assinatura.plano.deletedAt
  ) {
    throw new ForbiddenException(
      'O grupo precisa de um plano contratado ativo para incluir empresas.',
    );
  }
  const utilizadas = await tx.empresa.count({
    where: { grupoEconomicoId: grupoId, deletedAt: null },
  });
  if ((totalApos ?? utilizadas + 1) > assinatura.plano.limiteEmpresas) {
    throw new ForbiddenException(
      `O plano ${assinatura.plano.nome} permite ${assinatura.plano.limiteEmpresas} empresa(s). O grupo já possui ${utilizadas}. Amplie o plano para incluir mais empresas.`,
    );
  }
  return assinatura;
}

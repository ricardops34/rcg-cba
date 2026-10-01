import { ForbiddenException } from '@nestjs/common';
import type { TenantTx } from '../prisma/prisma.service';

export const normalizarWhatsapp = (numero: string | null | undefined) =>
  numero?.replace(/\D/g, '') || null;

/** Chamado dentro de withTenant: conta e vendedores compartilham um número.
 * Troca o contexto por empresa na mesma transação e restaura o tenant de origem.
 */
export async function gravarWhatsappDoUsuario(
  tx: TenantTx, usuarioId: string, empresaId: string,
  numero: string | null, actorId: string,
) {
  const usuario = await tx.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
    select: { celular: true, grupoEconomicoId: true },
  });
  const celular = normalizarWhatsapp(numero);
  const mudou = normalizarWhatsapp(usuario.celular) !== celular;
  await tx.usuario.update({
    where: { id: usuarioId },
    data: { celular, telefone: celular, updatedBy: actorId },
  });
  const empresas = usuario.grupoEconomicoId
    ? await tx.empresa.findMany({
        where: { grupoEconomicoId: usuario.grupoEconomicoId, deletedAt: null },
        select: { id: true },
      })
    : [{ id: empresaId }];
  if (!empresas.some((e) => e.id === empresaId)) {
    throw new ForbiddenException('Usuário e vendedor devem pertencer ao mesmo grupo econômico');
  }
  try {
    for (const { id } of empresas) {
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${id}, true)`;
      await tx.vendedor.updateMany({
        where: { usuarioId, empresaId: id, deletedAt: null },
        data: { telefone: celular, updatedBy: actorId },
      });
      if (mudou) await tx.whatsappVinculoFuncionario.deleteMany({ where: { usuarioId } });
    }
  } finally {
    await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresaId}, true)`;
  }
}

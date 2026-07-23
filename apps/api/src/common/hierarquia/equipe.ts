import type { TenantTx } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * IDs dos vínculos (UsuarioEmpresa) que o usuário logado supervisiona: toda a
 * subárvore abaixo do seu próprio vínculo (subordinados diretos e
 * indiretos), mais ele mesmo.
 *
 * Retorna `null` para quem tem perfil `sistemaBase` (isAdmin) — o chamador
 * então não aplica filtro (enxerga tudo da empresa, sem restrição de
 * carteira). Qualquer outro perfil é escopado igual, pela árvore
 * `superiorId` — não depende do nome/nível do perfil. Um usuário sem vínculo
 * na empresa recebe lista vazia (não vê nada de negócio ligado a vendedor).
 */
export async function equipeColaboradorIds(
  tx: TenantTx,
  empresaId: string,
  user: AuthenticatedUser,
): Promise<string[] | null> {
  if (user.isAdmin) return null;

  const colaboradores = await tx.usuarioEmpresa.findMany({
    where: { empresaId, deletedAt: null },
    select: { id: true, superiorId: true, usuarioId: true },
  });

  const eu = colaboradores.find((c) => c.usuarioId === user.id);
  if (!eu) return [];

  const filhosPor = new Map<string, string[]>();
  for (const c of colaboradores) {
    if (!c.superiorId) continue;
    const arr = filhosPor.get(c.superiorId) ?? [];
    arr.push(c.id);
    filhosPor.set(c.superiorId, arr);
  }

  const equipe: string[] = [eu.id];
  const fila = [...(filhosPor.get(eu.id) ?? [])];
  const visto = new Set<string>();
  while (fila.length) {
    const id = fila.shift()!;
    if (visto.has(id)) continue;
    visto.add(id);
    equipe.push(id);
    fila.push(...(filhosPor.get(id) ?? []));
  }
  return equipe;
}

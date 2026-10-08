import type { TenantTx } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Assinatura visível no aparelho do cliente. O texto persistido continua sem
 * o prefixo, para a Central renderizar o autor separadamente e não duplicar.
 */
export function mensagemComAutor(nome: string, texto: string): string {
  const perfil = nome.replace(/[*_~`]/g, '').trim() || 'Atendente';
  return `*${perfil}:*\n${texto}`;
}

/**
 * O nome que assina: o "Nome no WhatsApp" do perfil, quando a pessoa definiu
 * um, ou o nome completo.
 *
 * Lido do banco na hora do envio, e não do token: o `user.nome` vem do JWT e
 * só mudaria no próximo login. É só a assinatura que o cliente vê — a tela
 * da plataforma continua mostrando quem enviou pelo nome do cadastro.
 */
export async function nomeDeAssinatura(
  tx: TenantTx,
  user: Pick<AuthenticatedUser, 'id' | 'nome'>,
): Promise<string> {
  const usuario = await tx.usuario.findUnique({
    where: { id: user.id },
    select: { nome: true, nomeWhatsapp: true },
  });
  return usuario?.nomeWhatsapp?.trim() || usuario?.nome || user.nome;
}

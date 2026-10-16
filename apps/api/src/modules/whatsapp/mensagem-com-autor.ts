import type { TenantTx } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Assinatura visível no aparelho do cliente. O texto persistido continua sem
 * o prefixo, para a Central renderizar o autor separadamente e não duplicar.
 * Sem nome (`null`), a mensagem sai como foi escrita.
 */
export function mensagemComAutor(nome: string | null, texto: string): string {
  if (nome === null) return texto;
  const perfil = nome.replace(/[*_~`]/g, '').trim() || 'Atendente';
  return `*${perfil}:*\n${texto}`;
}

/**
 * Quem assina a mensagem no aparelho do cliente. Só assina quem ligou "Usar"
 * no perfil: com o interruptor desligado, a mensagem sai sem assinatura
 * (`null`). Ligado, vale o "Nome no WhatsApp" ou, se vazio, o nome completo.
 */
export function assinaturaDoUsuario(
  usuario:
    | { nome: string; nomeWhatsapp: string | null; usarNomeWhatsapp: boolean }
    | null
    | undefined,
): string | null {
  if (!usuario?.usarNomeWhatsapp) return null;
  return usuario.nomeWhatsapp?.trim() || usuario.nome;
}

/**
 * A assinatura de quem envia (ver `assinaturaDoUsuario`); `null` = sem assinatura.
 *
 * Lido do banco na hora do envio, e não do token: o `user.nome` vem do JWT e
 * só mudaria no próximo login. O balão da tela do atendimento usa o mesmo
 * nome, para o vendedor ver o que o cliente viu.
 */
export async function nomeDeAssinatura(
  tx: TenantTx,
  user: Pick<AuthenticatedUser, 'id'>,
): Promise<string | null> {
  const usuario = await tx.usuario.findUnique({
    where: { id: user.id },
    select: { nome: true, nomeWhatsapp: true, usarNomeWhatsapp: true },
  });
  return assinaturaDoUsuario(usuario);
}

/**
 * Assinatura visível no aparelho do cliente. O texto persistido continua sem
 * o prefixo, para a Central renderizar o autor separadamente e não duplicar.
 */
export function mensagemComAutor(nome: string, texto: string): string {
  const perfil = nome.replace(/[*_~`]/g, '').trim() || 'Atendente';
  return `*${perfil}:*\n${texto}`;
}

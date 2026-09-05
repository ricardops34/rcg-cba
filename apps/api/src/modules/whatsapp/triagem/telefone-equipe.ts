/**
 * Telefone da equipe: de onde vem e como se compara.
 *
 * **A fonte é o cadastro de vendedores** (`vendedores.telefone`) — vendedor,
 * gerente e supervisor têm cadastro ali. Não é `usuario_empresas.celular`:
 * aquelas colunas existem, mas ninguém as preenche (0 de 10 vínculos na base
 * de dev, contra 9 de 10 vendedores com telefone), e ler de lá fazia o aviso
 * da IA nunca sair.
 */

/** Só os dígitos, sem formatação. */
export function digitos(bruto: string | null | undefined): string {
  return (bruto ?? '').replace(/\D/g, '');
}

/**
 * Os últimos 8 dígitos — a chave de comparação de telefone deste módulo.
 *
 * Mesma convenção de `casarCliente`: cobre com/sem DDI 55 e com/sem o 9º
 * dígito sem precisar normalizar a base inteira. Devolve string vazia quando
 * não há dígitos suficientes para comparar, e quem chama trata isso como
 * "não dá para reconhecer" em vez de casar com qualquer coisa.
 */
export function sufixoTelefone(bruto: string | null | undefined): string {
  const d = digitos(bruto);
  return d.length >= 8 ? d.slice(-8) : '';
}

/**
 * Monta o JID brasileiro a partir do telefone do cadastro.
 *
 * O DDI é acrescentado, mas só quando ainda não está lá: cadastro preenchido
 * como `5567999998888` viraria `555567...` com um prefixo cego, e a mensagem
 * iria para um número que não existe. Devolve null quando o número é curto
 * demais para ser um celular com DDD — nesse caso não há a quem mandar, e
 * inventar dígito é pior do que não enviar.
 */
export function jidBrasileiro(bruto: string | null | undefined): string | null {
  let d = digitos(bruto);
  // 12 ou 13 dígitos começando em 55 é DDI + DDD + 8 ou 9 dígitos.
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    d = d.slice(2);
  }
  if (d.length < 10 || d.length > 11) return null;
  return `55${d}@s.whatsapp.net`;
}

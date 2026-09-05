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
 * A identidade **exata** de um aparelho, para servir de chave de pareamento.
 *
 * Diferente de `sufixoTelefone`, que é tolerante de propósito para encontrar a
 * pessoa no cadastro: aqui a tolerância é uma falha de segurança. O pareamento
 * era chaveado pelo sufixo de 8 dígitos, e isso significava que **um número de
 * outro DDD com os mesmos 8 dígitos finais herdava a confirmação do vendedor**
 * — (67) 99869-9444 e (11) 99869-9444 caíam no mesmo vínculo, e o segundo
 * entrava como funcionário com a carteira do primeiro.
 *
 * A chave preserva o DDD (é ele que separa os dois) e colapsa só o que é o
 * mesmo aparelho: o DDI e o 9º dígito, que o WhatsApp entrega ora com, ora sem.
 * Devolve string vazia quando não dá para identificar com segurança — e quem
 * chama trata isso como "não parear".
 */
export function chaveTelefone(bruto: string | null | undefined): string {
  let d = digitos(bruto);
  // DDI 55 + DDD + 8 ou 9 dígitos.
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    d = d.slice(2);
  }
  // Celular com o 9 na frente do número: vira a forma de 10 dígitos, para o
  // mesmo aparelho não gerar dois pareamentos.
  if (d.length === 11 && d[2] === '9') {
    d = d.slice(0, 2) + d.slice(3);
  }
  // Sem DDD não há como distinguir de um número de outra região — e é
  // exatamente essa distinção que a chave existe para fazer.
  return d.length === 10 ? d : '';
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

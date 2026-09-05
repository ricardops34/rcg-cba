/**
 * O bot nunca pede credencial — e isso precisa ser código, não instrução.
 *
 * O prompt já manda não pedir senha. Instrução de prompt não é barreira: ela
 * descreve um comportamento desejado a um modelo que pode ser levado a outro
 * por quem está do outro lado. Quem escreve para o WhatsApp da empresa não tem
 * como saber que a mensagem veio de um modelo convencido — para ele é a empresa
 * pedindo a senha dele, no número oficial dela.
 *
 * Então a última coisa antes de a mensagem sair é esta função. Ela não corrige
 * o texto: **recusa o envio**, e quem chama manda uma frase fixa no lugar.
 *
 * Vale para os dois lados do atendimento, cliente e funcionário: nem um nem
 * outro deve digitar senha num WhatsApp.
 */

/**
 * O que é credencial. Deliberadamente curto: cada palavra aqui é uma frase que
 * o bot deixa de conseguir dizer, e uma lista grande demais bloquearia
 * atendimento legítimo.
 *
 * **"código" está fora, de propósito** — o pareamento do funcionário pede
 * justamente um código de 6 dígitos, e bloqueá-lo quebraria o fluxo que existe
 * para *aumentar* a segurança.
 */
const CREDENCIAIS = [
  'senha',
  'palavra-passe',
  'cvv',
  'cvc',
  'cartão de crédito',
  'cartao de credito',
  'número do cartão',
  'numero do cartao',
  'dados do cartão',
  'dados do cartao',
];

/**
 * Como se pede alguma coisa. Sem isto, o bot também não conseguiria dizer
 * "nunca peço sua senha" — que é uma frase boa, e a única em que a palavra
 * aparece sem ser um pedido.
 */
const PEDIDOS = [
  'informe',
  'digite',
  'envie',
  'mande',
  'me diga',
  'me passe',
  'passe',
  'confirme',
  'qual',
  'preciso d',
  'precisa d',
];

/** Tira acento para a comparação não depender de como foi escrito. */
function normalizar(texto: string) {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * `true` quando a mensagem **pede** uma credencial.
 *
 * A checagem é por frase: "não peço senha, mas confirme seu CNPJ" tem pedido e
 * credencial no mesmo texto sem ser um pedido de credencial. Separar por
 * pontuação evita esse falso positivo, que na prática seria a IA emudecida
 * numa resposta correta.
 */
export function pedeCredencial(texto: string): boolean {
  const frases = normalizar(texto).split(/[.!?;\n]+/);
  return frases.some((frase) => {
    const temCredencial = CREDENCIAIS.some((c) =>
      frase.includes(normalizar(c)),
    );
    if (!temCredencial) return false;
    return PEDIDOS.some((p) => frase.includes(normalizar(p)));
  });
}

/**
 * O que sai no lugar. Não explica que houve bloqueio — para quem lê, é só o
 * atendimento se comportando corretamente — e encaminha para gente, porque o
 * assunto que levou até aqui não vai se resolver com o bot.
 */
export const RESPOSTA_SEM_CREDENCIAL =
  'Por segurança, não trato de senha nem de dado de cartão por aqui. ' +
  'Vou te encaminhar para uma pessoa da equipe.';

import { momentoLocal } from '../../../common/horario/horario-trabalho';

/**
 * A mensagem de abertura do atendimento do roteiro: uma saudação curta, como
 * uma pessoa escreveria ("Bom dia, tudo bem?"), e não um texto de campanha. O
 * assunto da conversa vem depois, escrito pelo vendedor.
 *
 * A saudação segue o horário local do atendimento, e a forma varia entre
 * poucas opções — a mesma frase para todos os clientes, no mesmo minuto, é o
 * que denuncia automação.
 */
export function saudacaoDoHorario(
  quando: Date,
  /** Devolve um número em [0, 1); injetável para o teste. */
  sorteio: () => number = Math.random,
): string {
  const hora = Number(momentoLocal(quando).hora.slice(0, 2));
  const periodo = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const formas = [
    `${periodo}, tudo bem?`,
    `${periodo}! Tudo bem?`,
    `Olá, ${periodo.toLowerCase()}! Tudo bem?`,
  ];
  return formas[
    Math.min(formas.length - 1, Math.floor(sorteio() * formas.length))
  ];
}

/**
 * Quanto "digitando…" aparece antes de a saudação sair: de 2 a 6 segundos. Sair
 * no instante em que o horário bate seria o outro sinal de automação.
 */
export function atrasoDeDigitacaoMs(
  sorteio: () => number = Math.random,
): number {
  return 2000 + Math.floor(sorteio() * 4000);
}

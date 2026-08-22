/**
 * Troca o nome do arquivo XML em disco por um booleano.
 *
 * A tela precisa saber se pode oferecer o botão de 2ª via; o nome do arquivo
 * é detalhe do servidor e não tem por que sair da API — expor caminho só dá
 * superfície para adivinhação.
 *
 * Fica em arquivo próprio (e não no service) porque a Posição de Cliente monta
 * a lista de notas por conta própria e precisa da mesma flag — importar o
 * service ali arrastaria o gerador de DANFE, com jsPDF junto.
 */
export function comFlagXml<T extends { xmlArquivo?: string | null }>(nota: T) {
  const { xmlArquivo, ...resto } = nota;
  return { ...resto, temXml: !!xmlArquivo };
}

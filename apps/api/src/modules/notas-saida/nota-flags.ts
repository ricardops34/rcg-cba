/**
 * "Esta nota tem 2ª via?" respondido sem tocar no XML.
 *
 * O conteúdo vive na tabela acessória `nota_saida_xml` justamente para não
 * trafegar em listagem; então quem decide se o botão aparece é
 * `xmlRecebidoEm`, um metadado curto na própria nota. Um join só para saber
 * se existe linha, em toda listagem, seria trocar um problema por outro.
 *
 * Fica em arquivo próprio (e não no service) porque a Posição de Cliente monta
 * a lista de notas por conta própria e precisa da mesma flag — importar o
 * service ali arrastaria o gerador de DANFE, com jsPDF junto.
 */
export function comFlagXml<T extends { xmlRecebidoEm?: Date | string | null }>(
  nota: T,
) {
  return { ...nota, temXml: !!nota.xmlRecebidoEm };
}

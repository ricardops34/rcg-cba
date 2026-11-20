/**
 * Decodifica a "encoded polyline" do Google (o caminho pelas ruas da rota) em
 * pontos [latitude, longitude]. Algoritmo público do Google, precisão 5.
 */
export function decodificarPolilinha(texto: string): Array<[number, number]> {
  const pontos: Array<[number, number]> = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const proximo = () => {
    let resultado = 0;
    let deslocamento = 0;
    let b: number;
    do {
      b = texto.charCodeAt(i++) - 63;
      resultado |= (b & 0x1f) << deslocamento;
      deslocamento += 5;
    } while (b >= 0x20 && i < texto.length + 1);
    return resultado & 1 ? ~(resultado >> 1) : resultado >> 1;
  };
  while (i < texto.length) {
    lat += proximo();
    lng += proximo();
    pontos.push([lat / 1e5, lng / 1e5]);
  }
  return pontos;
}

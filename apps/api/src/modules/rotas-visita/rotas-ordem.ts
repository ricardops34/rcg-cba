/**
 * Ordem das paradas sem serviço externo (rota "em linha reta"): vizinho mais
 * próximo a partir da origem e depois 2-opt, que desfaz os cruzamentos. Não é
 * o ótimo, mas para as dezenas de paradas de um dia fica perto — e não custa
 * nada. Funções puras, para o teste.
 */
export type Ponto = { latitude: number; longitude: number };

/** Distância em metros sobre a esfera (haversine). */
export function distanciaMetros(a: Ponto, b: Ponto): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Comprimento do percurso origem → paradas (→ origem, se retornar). */
export function comprimento(
  origem: Ponto,
  paradas: Ponto[],
  retornar: boolean,
): number {
  let total = 0;
  let atual = origem;
  for (const p of paradas) {
    total += distanciaMetros(atual, p);
    atual = p;
  }
  if (retornar && paradas.length) total += distanciaMetros(atual, origem);
  return total;
}

/** Índices das paradas na ordem da visita. */
export function ordenarParadas(
  origem: Ponto,
  paradas: Ponto[],
  retornar: boolean,
): number[] {
  const restantes = paradas.map((_, i) => i);
  const ordem: number[] = [];
  let atual = origem;
  while (restantes.length) {
    let melhor = 0;
    for (let k = 1; k < restantes.length; k++) {
      if (
        distanciaMetros(atual, paradas[restantes[k]]) <
        distanciaMetros(atual, paradas[restantes[melhor]])
      ) {
        melhor = k;
      }
    }
    const [escolhido] = restantes.splice(melhor, 1);
    ordem.push(escolhido);
    atual = paradas[escolhido];
  }

  // 2-opt: inverte trechos enquanto encurtar o percurso.
  const custo = (o: number[]) =>
    comprimento(
      origem,
      o.map((i) => paradas[i]),
      retornar,
    );
  let melhorou = true;
  let voltas = 0;
  while (melhorou && voltas < 50) {
    melhorou = false;
    voltas++;
    for (let i = 0; i < ordem.length - 1; i++) {
      for (let j = i + 1; j < ordem.length; j++) {
        const nova = [
          ...ordem.slice(0, i),
          ...ordem.slice(i, j + 1).reverse(),
          ...ordem.slice(j + 1),
        ];
        if (custo(nova) + 1e-6 < custo(ordem)) {
          ordem.splice(0, ordem.length, ...nova);
          melhorou = true;
        }
      }
    }
  }
  return ordem;
}

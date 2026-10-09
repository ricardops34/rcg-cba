/**
 * Tipo de logradouro: a forma que o cadastro grava (abreviada, como chega do
 * Protheus: "AV.", "R.") e as grafias que contam como o mesmo tipo na
 * comparação. Decisão do usuário, 2026-10-09: abreviar, e endereço que só
 * difere na abreviatura do tipo não é alteração.
 */
const TIPOS: { abreviado: string; grafias: string[] }[] = [
  { abreviado: 'AV.', grafias: ['AVENIDA', 'AVEN', 'AV'] },
  { abreviado: 'R.', grafias: ['RUA', 'R'] },
  { abreviado: 'ROD.', grafias: ['RODOVIA', 'ROD'] },
  { abreviado: 'EST.', grafias: ['ESTRADA', 'ESTR', 'EST'] },
  { abreviado: 'AL.', grafias: ['ALAMEDA', 'AL'] },
  { abreviado: 'TV.', grafias: ['TRAVESSA', 'TRAV', 'TV'] },
  { abreviado: 'PC.', grafias: ['PRACA', 'PCA', 'PC'] },
  { abreviado: 'LGO.', grafias: ['LARGO', 'LGO'] },
  { abreviado: 'VL.', grafias: ['VILA', 'VL'] },
  { abreviado: 'CJ.', grafias: ['CONJUNTO', 'CONJ', 'CJ'] },
  { abreviado: 'QD.', grafias: ['QUADRA', 'QD'] },
];

/** Grafia (sem ponto, sem acento, maiúscula) → índice em TIPOS. */
const TIPO_POR_GRAFIA = new Map<string, number>(
  TIPOS.flatMap((t, i) => t.grafias.map((g) => [g, i] as const)),
);

// Depois do NFD, acento e cedilha viram marcas combinantes (\p{M}): sai tudo.
const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');

/**
 * "AVENIDA" → "AV."; tipo fora da tabela volta como veio (por extenso), em
 * vez de inventar uma abreviação.
 */
export function abreviarTipoLogradouro(tipo: string): string {
  const grafia = semAcento(tipo).toUpperCase().replace(/\./g, '').trim();
  const i = TIPO_POR_GRAFIA.get(grafia);
  return i == null ? tipo.trim() : TIPOS[i].abreviado;
}

/**
 * Texto para comparar: sem acento (o "Ç" vira "C"), maiúsculo, espaços
 * únicos. "Paçoca Comércio" e "PACOCA COMERCIO" dão o mesmo resultado.
 */
export function textoCanonico(texto: string): string {
  return semAcento(texto).toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Forma canônica para comparar endereços: maiúscula, sem acento, sem
 * pontuação, espaços únicos, e o tipo do começo trocado por um código único —
 * "AV. ZILA CORREA MACHADO,11440" e "AVENIDA ZILA CORREA MACHADO, 11440"
 * dão o mesmo resultado. Nome diferente continua diferente.
 */
export function enderecoCanonico(endereco: string): string {
  const palavras = semAcento(endereco)
    .toUpperCase()
    .replace(/[.,;:\-/]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const i = palavras.length > 1 ? TIPO_POR_GRAFIA.get(palavras[0]) : undefined;
  if (i != null) palavras[0] = `#${i}`;
  return palavras.join(' ');
}

/**
 * Telefone para comparar: só dígitos, sem o zero do DDD ("067 ..." e
 * "67 ..." são o mesmo número).
 */
export function telefoneCanonico(telefone: string): string {
  return telefone.replace(/\D/g, '').replace(/^0+/, '');
}

import type { jsPDF } from 'jspdf';

/**
 * Códigos de barras dos documentos fiscais/bancários, desenhados como
 * retângulos no próprio PDF.
 *
 * Não há biblioteca aqui de propósito: as duas simbologias que a plataforma
 * precisa são tabelas fixas e curtas, e a alternativa (bwip-js/JsBarcode)
 * traria canvas ou DOM para o backend — o mesmo problema que já obrigou o PDF
 * do orçamento a abrir mão do `<canvas>`.
 *
 * As funções de codificação são **puras**: devolvem a lista de larguras em
 * módulos, alternando barra e espaço começando por barra. Quem desenha decide
 * quanto vale um módulo em milímetros. Isso deixa a parte crítica — a que, se
 * errar, produz um boleto que o caixa não lê — testável sem PDF.
 */

/** 2 de 5 intercalado: cinco barras por dígito, n = estreita, w = larga. */
const ITF_PADROES = [
  'nnwwn', // 0
  'wnnnw', // 1
  'nwnnw', // 2
  'wwnnn', // 3
  'nnwnw', // 4
  'wnwnn', // 5
  'nwwnn', // 6
  'nnnww', // 7
  'wnnwn', // 8
  'nwnwn', // 9
];

/** Razão largo:estreito do 2 de 5 intercalado no boleto bancário. */
const ITF_RAZAO = 3;

/**
 * Código de barras do boleto (2 de 5 intercalado, 44 dígitos).
 *
 * "Intercalado" é literal: os dígitos andam aos pares — o primeiro vira as
 * cinco barras, o segundo os cinco espaços entre elas. Por isso a quantidade
 * de dígitos tem de ser par; 44 é o tamanho fixo da FEBRABAN.
 */
export function itfModulos(digitos: string): number[] {
  if (!/^\d+$/.test(digitos)) {
    throw new Error('Código de barras 2 de 5 aceita apenas dígitos');
  }
  if (digitos.length % 2 !== 0) {
    throw new Error('Código de barras 2 de 5 exige quantidade par de dígitos');
  }

  // Start: quatro módulos estreitos (barra, espaço, barra, espaço).
  const modulos: number[] = [1, 1, 1, 1];

  for (let i = 0; i < digitos.length; i += 2) {
    const barras = ITF_PADROES[Number(digitos[i])];
    const espacos = ITF_PADROES[Number(digitos[i + 1])];
    for (let p = 0; p < 5; p++) {
      modulos.push(barras[p] === 'w' ? ITF_RAZAO : 1);
      modulos.push(espacos[p] === 'w' ? ITF_RAZAO : 1);
    }
  }

  // Stop: barra larga, espaço estreito, barra estreita.
  modulos.push(ITF_RAZAO, 1, 1);
  return modulos;
}

/**
 * Tabela do Code 128: 107 símbolos, cada um com as larguras de suas 6 barras e
 * espaços (11 módulos no total). O último (STOP) é a exceção com 7 elementos.
 */
const CODE128_PADROES = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

const CODE128_START_C = 105;
const CODE128_STOP = 106;

/**
 * Code 128 subconjunto C (a chave de acesso da NF-e no DANFE).
 *
 * O subconjunto C codifica **dois dígitos por símbolo**, que é o que faz a
 * chave de 44 dígitos caber na faixa do DANFE. Exige, por isso, quantidade
 * par de dígitos — a chave sempre tem.
 */
export function code128cModulos(digitos: string): number[] {
  if (!/^\d+$/.test(digitos)) {
    throw new Error('Code 128C aceita apenas dígitos');
  }
  if (digitos.length % 2 !== 0) {
    throw new Error('Code 128C exige quantidade par de dígitos');
  }

  const simbolos: number[] = [CODE128_START_C];
  for (let i = 0; i < digitos.length; i += 2) {
    simbolos.push(Number(digitos.slice(i, i + 2)));
  }

  // Dígito de verificação: soma ponderada pela posição (o START pesa 1), em
  // módulo 103. Sem ele o leitor recusa o código.
  let soma = CODE128_START_C;
  for (let i = 1; i < simbolos.length; i++) soma += simbolos[i] * i;
  simbolos.push(soma % 103);
  simbolos.push(CODE128_STOP);

  const modulos: number[] = [];
  for (const simbolo of simbolos) {
    for (const largura of CODE128_PADROES[simbolo]) {
      modulos.push(Number(largura));
    }
  }
  // Margem final obrigatória do Code 128 (quiet zone codificada como barra
  // final de 2 módulos já vem no STOP de 7 elementos).
  return modulos;
}

/**
 * Desenha no PDF a sequência de módulos, começando por barra e alternando.
 *
 * `larguraModulo` é o "X" da simbologia, em mm. O boleto pede X entre 0,254 e
 * 0,318 mm; o DANFE não fixa, mas o mesmo intervalo lê bem em impressora
 * comum e em foto de celular — que é como o cliente vai receber o arquivo.
 */
export function desenharBarras(
  doc: jsPDF,
  modulos: number[],
  opcoes: { x: number; y: number; altura: number; larguraModulo: number },
): number {
  const { x, y, altura, larguraModulo } = opcoes;
  let cursor = x;
  doc.setFillColor(0, 0, 0);
  modulos.forEach((largura, indice) => {
    const espessura = largura * larguraModulo;
    // Índice par = barra; ímpar = espaço (só avança o cursor).
    if (indice % 2 === 0) doc.rect(cursor, y, espessura, altura, 'F');
    cursor += espessura;
  });
  return cursor - x;
}

/** Largura total (mm) que a sequência vai ocupar — para centralizar antes de desenhar. */
export function larguraBarras(modulos: number[], larguraModulo: number): number {
  return modulos.reduce((soma, m) => soma + m, 0) * larguraModulo;
}

/**
 * Parte o Markdown de uma ficha técnica em trechos indexáveis.
 *
 * ## O tamanho é um equilíbrio, não um número bonito
 *
 * Trecho **curto demais** perde o contexto: "20 ml por kg" sozinho não diz de
 * que produto nem para quê, e o vetor dele aponta para lugar nenhum. Trecho
 * **longo demais** volta ao problema que os trechos existem para resolver —
 * dilui o assunto no vetor e enche o contexto do modelo.
 *
 * O alvo é ~800 caracteres, que na prática é um parágrafo com o seu título ou
 * um punhado de itens de lista.
 *
 * ## Corta onde o documento já se divide
 *
 * Ficha técnica tem estrutura: títulos de seção, listas, tabelas. Cortar em
 * `\n\n` respeita isso e mantém junto o que o autor manteve junto. Cortar a
 * cada N caracteres partiria "Diluição: 1:100 para" / "limpeza geral" no meio.
 *
 * ## O título vai junto de cada trecho
 *
 * Um trecho que diz "não contém cloro ativo" perde muito valor sem o "#
 * Alvejante sem cloro 5 L" do topo. Repetir o título custa poucos caracteres e
 * é o que faz o vetor do trecho apontar para o produto certo.
 */

/** Alvo de tamanho de cada trecho. Ver o cabeçalho para o porquê. */
const ALVO = 800;

/**
 * Abaixo disto, o trecho é grudado no seguinte em vez de virar linha própria.
 *
 * É o caso do título de seção sozinho ("## Aplicação") e da linha solta de
 * tabela: sozinhos não respondem nada.
 */
const MINIMO = 120;

/** Teto por ficha. Documento gigante não deve virar 400 chamadas de embedding. */
const MAXIMO_TRECHOS = 60;

/** Remove a marcação que não ajuda a busca nem o modelo a entender o texto. */
function limpar(texto: string): string {
  return texto
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\s)\*(\S.*?\S)\*(?=\s|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * O primeiro título do documento, para acompanhar cada trecho.
 *
 * Cai para a primeira linha não vazia quando não há título — ficha convertida
 * de PDF nem sempre tem um.
 */
function tituloDoTexto(markdown: string): string {
  const titulo = /^#{1,6}\s+(.+)$/m.exec(markdown)?.[1];
  if (titulo) return titulo.trim();
  const primeira = markdown.split('\n').find((l) => l.trim().length > 0);
  return primeira?.replace(/^#{1,6}\s+/, '').trim() ?? '';
}

export function partirFicha(markdown: string, titulo?: string): string[] {
  const texto = limpar(markdown ?? '');
  if (!texto) return [];

  const cabecalho = (titulo?.trim() || tituloDoTexto(texto)).slice(0, 120);

  const blocos = texto
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const juntos: string[] = [];

  for (const bloco of blocos) {
    const anterior = juntos[juntos.length - 1];

    // Bloco curto gruda no anterior — e, se for o primeiro, espera o próximo.
    if (
      anterior &&
      (anterior.length < MINIMO || anterior.length + bloco.length <= ALVO)
    ) {
      juntos[juntos.length - 1] = `${anterior}\n${bloco}`;
      continue;
    }

    // Bloco maior que o alvo sozinho: parte por linha, que é onde a lista e a
    // tabela se dividem sem perder sentido.
    if (bloco.length > ALVO * 1.5) {
      let atual = '';
      for (const linha of bloco.split('\n')) {
        if (atual && atual.length + linha.length > ALVO) {
          juntos.push(atual);
          atual = linha;
        } else {
          atual = atual ? `${atual}\n${linha}` : linha;
        }
      }
      if (atual) juntos.push(atual);
      continue;
    }

    juntos.push(bloco);
  }

  // O último trecho pode ter ficado curto demais para significar algo.
  if (juntos.length > 1) {
    const ultimo = juntos[juntos.length - 1];
    if (ultimo.length < MINIMO) {
      juntos.pop();
      juntos[juntos.length - 1] += `\n${ultimo}`;
    }
  }

  return juntos.slice(0, MAXIMO_TRECHOS).map((trecho) => {
    // O título só é repetido quando o trecho já não o contém — o primeiro
    // trecho quase sempre começa por ele.
    const jaTem =
      !cabecalho ||
      trecho.slice(0, cabecalho.length + 20).includes(cabecalho.slice(0, 40));
    return jaTem ? trecho : `${cabecalho}\n${trecho}`;
  });
}

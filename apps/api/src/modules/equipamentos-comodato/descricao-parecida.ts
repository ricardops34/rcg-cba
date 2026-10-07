/**
 * Raízes que não dizem nada sobre o que o equipamento usa: o tipo do próprio
 * equipamento e cor/material. "Dispenser" casaria todo dispenser com todo
 * produto que traz "dispenser" no nome.
 */
const RAIZES_IGNORADAS = new Set([
  'DISPE',
  'SUPOR',
  'BRANC',
  'PRETO',
  'CINZA',
  'CROMA',
  'PLAST',
  'ACRIL',
  'METAL',
  'COMOD',
]);

const TAMANHO_RAIZ = 5;

function palavras(descricao: string): string[] {
  return descricao
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

/**
 * Raízes de 5 letras das palavras que identificam o uso do equipamento.
 *
 * A raiz, e não a palavra inteira, porque o cadastro abrevia: o dispenser é
 * "TOALHA INTERFOLHA" e o papel é "TOALHA INTERF. 2D". A primeira palavra sai:
 * no cadastro ela é a marca ("PLESTIN -DISP. ..."), e a marca do equipamento
 * casaria com qualquer produto do mesmo fabricante.
 */
export function raizesDoEquipamento(descricao: string): Set<string> {
  return new Set(
    palavras(descricao)
      .slice(1)
      .filter((p) => p.length >= TAMANHO_RAIZ && !/^\d+$/.test(p))
      .map((p) => p.slice(0, TAMANHO_RAIZ))
      .filter((r) => !RAIZES_IGNORADAS.has(r)),
  );
}

/**
 * Quantas raízes do equipamento aparecem na descrição do produto.
 *
 * Conta, e não só diz sim ou não, porque uma raiz sozinha engana: "INTER" do
 * dispenser de toalha interfolha casa também com o "PAPEL HIGIENICO INTER.",
 * que é de outro dispenser. O papel toalha interfolhado casa duas (TOALH e
 * INTER) e por isso vem antes.
 */
export function raizesEmComum(
  raizes: Set<string>,
  descricaoProduto: string,
): number {
  return new Set(
    palavras(descricaoProduto)
      .filter((p) => p.length >= TAMANHO_RAIZ)
      .map((p) => p.slice(0, TAMANHO_RAIZ))
      .filter((r) => raizes.has(r)),
  ).size;
}

/** O produto tem alguma palavra com a mesma raiz de uma do equipamento. */
export function descricaoParecida(
  raizes: Set<string>,
  descricaoProduto: string,
): boolean {
  return raizesEmComum(raizes, descricaoProduto) > 0;
}

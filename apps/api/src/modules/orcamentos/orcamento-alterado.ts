/**
 * O que derruba a liberação de desconto: **qualquer alteração de fato** no
 * orçamento (decisão de 2026-11-10). Mudar só o status (efetivar, recusar) ou o
 * ativo não conta — senão efetivar um orçamento liberado apagaria a liberação
 * e a própria efetivação seria recusada.
 *
 * "De fato" porque o formulário reenvia o orçamento inteiro, itens inclusive, a
 * cada gravação: comparar só a presença dos campos derrubaria a liberação em
 * todo salvar, e foi exatamente isso que quebrava o efetivar pela tela.
 */

/** Campos que não são conteúdo da proposta. */
const IGNORADOS = new Set(['status', 'ativo', 'vendedorId', 'itens']);

type ItemComparavel = {
  produtoId: string;
  quantidade: number;
  vlrUnitario: number;
};

const centavos = (v: number) => Math.round(v * 100);

function assinatura(itens: ItemComparavel[]) {
  return itens
    .map((i) => `${i.produtoId}|${i.quantidade}|${centavos(i.vlrUnitario)}`)
    .sort()
    .join(';');
}

export function itensMudaram(
  gravados: ItemComparavel[],
  novos: ItemComparavel[],
): boolean {
  return assinatura(gravados) !== assinatura(novos);
}

/** Datas pelo dia; texto vazio vale nulo. */
function normalizar(v: unknown): unknown {
  if (v === undefined || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

/**
 * Algum campo do cabeçalho que veio no payload difere do gravado? Campo ausente
 * (`undefined`) é "não mexeu".
 */
export function cabecalhoMudou(
  payload: Record<string, unknown>,
  gravado: Record<string, unknown>,
): boolean {
  return Object.entries(payload).some(
    ([campo, valor]) =>
      valor !== undefined &&
      !IGNORADOS.has(campo) &&
      normalizar(valor) !== normalizar(gravado[campo]),
  );
}

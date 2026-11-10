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
 * Campos do cabeçalho que vieram no payload e diferem do gravado. Campo
 * ausente (`undefined`) é "não mexeu".
 */
export function camposAlterados(
  payload: Record<string, unknown>,
  gravado: Record<string, unknown>,
  ignorar: ReadonlySet<string> = IGNORADOS,
): string[] {
  return Object.entries(payload)
    .filter(
      ([campo, valor]) =>
        valor !== undefined &&
        !ignorar.has(campo) &&
        normalizar(valor) !== normalizar(gravado[campo]),
    )
    .map(([campo]) => campo);
}

/** Algum campo de conteúdo da proposta mudou? (derruba a liberação) */
export function cabecalhoMudou(
  payload: Record<string, unknown>,
  gravado: Record<string, unknown>,
): boolean {
  return camposAlterados(payload, gravado).length > 0;
}

/** Para o histórico: status tem evento próprio, vendedor acompanha o cliente. */
export const IGNORADOS_NO_HISTORICO: ReadonlySet<string> = new Set([
  'status',
  'vendedorId',
  'itens',
]);

const ROTULO_CAMPO: Record<string, string> = {
  titulo: 'título',
  clienteId: 'cliente',
  oportunidadeId: 'oportunidade',
  condicaoPagamentoId: 'condição de pagamento',
  tabelaPrecoId: 'tabela de preço',
  dataValidade: 'validade',
  dataRetorno: 'data de retorno',
  observacao: 'observação',
  ativo: 'ativo/inativo',
};

/**
 * "Alterado: itens, condição de pagamento." — o que o histórico mostra.
 * Os dados do interessado (prospect*) viram um item só.
 */
export function descreverAlteracao(campos: string[]): string {
  const rotulos = [
    ...new Set(
      campos.map((c) =>
        c.startsWith('prospect')
          ? 'dados do interessado'
          : (ROTULO_CAMPO[c] ?? c),
      ),
    ),
  ];
  return `Alterado: ${rotulos.join(', ')}.`;
}

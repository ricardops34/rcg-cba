import type { RegraDescontoFaixaLinha } from "./regra-desconto";

/**
 * Cálculo da comissão de um item a partir da regra de desconto.
 *
 * Mora nos contratos, e não na API, porque os dois lados precisam do mesmo
 * resultado: o servidor grava o percentual ao salvar o orçamento, e a tela
 * mostra a prévia enquanto o vendedor digita o preço. Uma implementação só
 * evita divergência entre o que o vendedor vê e o que é gravado.
 *
 * Regra combinada: o percentual do **vendedor** é a base; a faixa em que o
 * desconto caiu diz quanto dessa base ele recebe (`Base` da SZ0). O
 * `% Comissão` do cabeçalho da regra (Z0_COMISS) não entra na conta.
 */

/** O mínimo da regra que o cálculo precisa — serve tanto pro registro completo quanto pro resumo da tela. */
export interface RegraParaCalculo {
  percDescontoMaximo: number;
  percDescontoAutorizado: number;
  faixas: RegraDescontoFaixaLinha[];
}

export interface ComissaoCalculada {
  /** Comissão do item, em %. Null quando não há como apurar (sem vendedor com % base, ou sem regra). */
  percComissao: number | null;
  /** Sequência da faixa aplicada, ou null se nenhuma cobre o desconto. */
  sequenciaFaixa: number | null;
  /** % da comissão do vendedor pago na faixa (campo Base). */
  percBaseComissao: number | null;
  /** Desconto passou do "% Desc Máximo" (Z0_PERMAX) — só avisa, não bloqueia. */
  acimaDoMaximo: boolean;
  /** Desconto passou também do "% Desc Autorizado" (Z0_DESCAUT). */
  acimaDoAutorizado: boolean;
}

const VAZIO: ComissaoCalculada = {
  percComissao: null,
  sequenciaFaixa: null,
  percBaseComissao: null,
  acimaDoMaximo: false,
  acimaDoAutorizado: false,
};

/**
 * Faixa que vale para um desconto. Normalmente é a que o contém.
 *
 * Dois casos de borda, resolvidos de formas diferentes de propósito:
 * - **buraco entre faixas** (o cadastro herdado do ERP tem, ex.: 35,01–37 e a
 *   seguinte só a partir de 38,01): cai no degrau anterior, já que as faixas
 *   descem em escada e o degrau vigente é o último iniciado;
 * - **desconto além da última faixa** (ex.: 10% numa regra que só prevê até
 *   5%): nenhuma faixa vale. Quem chama trata como comissão zero — a regra
 *   não previu prêmio para um desconto desse tamanho.
 */
export function faixaDoDesconto(
  faixas: RegraDescontoFaixaLinha[],
  percDesconto: number,
): RegraDescontoFaixaLinha | null {
  if (faixas.length === 0) return null;
  const ordenadas = [...faixas].sort((a, b) => a.percInicial - b.percInicial);
  const exata = ordenadas.find(
    (f) => percDesconto >= f.percInicial && percDesconto <= f.percFinal,
  );
  if (exata) return exata;

  const fimDeTodas = Math.max(...ordenadas.map((f) => f.percFinal));
  if (percDesconto > fimDeTodas) return null;

  const iniciadas = ordenadas.filter((f) => f.percInicial <= percDesconto);
  return iniciadas.length > 0 ? iniciadas[iniciadas.length - 1] : null;
}

/**
 * @param percDesconto desconto da linha, em % (negativo é tratado como 0)
 * @param percComissaoVendedor % base do vendedor; null/0 = sem base para apurar
 */
export function calcularComissaoItem(
  regra: RegraParaCalculo | null | undefined,
  percDesconto: number | null | undefined,
  percComissaoVendedor: number | null | undefined,
): ComissaoCalculada {
  if (!regra) return VAZIO;

  // Sem preço de tabela não há desconto conhecido: trata como venda sem
  // desconto, que é a primeira faixa.
  const desconto = Math.max(0, percDesconto ?? 0);
  const acimaDoMaximo = desconto > regra.percDescontoMaximo;
  const acimaDoAutorizado = desconto > regra.percDescontoAutorizado;

  const faixa = faixaDoDesconto(regra.faixas, desconto);
  if (!faixa) {
    // Regra sem faixa nenhuma: não há o que apurar (null). Com faixas, mas
    // desconto além da última: a regra não prevê comissão aí, então zero.
    return {
      ...VAZIO,
      percComissao: regra.faixas.length > 0 ? 0 : null,
      percBaseComissao: regra.faixas.length > 0 ? 0 : null,
      acimaDoMaximo,
      acimaDoAutorizado,
    };
  }

  const base = percComissaoVendedor ?? null;
  return {
    percComissao:
      base == null ? null : Math.round(base * faixa.percBaseComissao) / 100,
    sequenciaFaixa: faixa.sequencia,
    percBaseComissao: faixa.percBaseComissao,
    acimaDoMaximo,
    acimaDoAutorizado,
  };
}

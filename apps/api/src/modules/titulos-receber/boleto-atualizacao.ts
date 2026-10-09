/**
 * Atualização monetária do boleto vencido e janela de reemissão.
 *
 * Regra de negócio fechada com o usuário em 2026-08-21:
 *
 * 1. **Título vencido sai com valor atualizado** — saldo + multa + juros pro
 *    rata die até o dia da emissão. Reimprimir o valor original de um título
 *    em atraso faria o cliente pagar a menos e o título continuar em aberto
 *    por diferença, que é o pior desfecho possível para o vendedor.
 * 2. **A emissão para depois de 30 dias de atraso.** Passado esse prazo a
 *    cobrança normalmente já está em outro rito (negativação, protesto,
 *    acordo), e um boleto emitido pela plataforma atropelaria isso.
 *
 * Módulo puro, testável sem banco — a aritmética de encargo é o tipo de coisa
 * que precisa ser conferível linha a linha.
 */

/** Depois disso, a plataforma não emite mais: o caso é do financeiro. Padrão 60 dias (configurável em Parâmetros). */
export const PRAZO_MAXIMO_REEMISSAO_DIAS = 60;

/** Meia-noite local — encargo se conta por dia inteiro, não por hora. */
export function inicioDoDia(data: Date = new Date()): Date {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Dias corridos de atraso; 0 se ainda não venceu (ou não tem vencimento). */
export function diasEmAtraso(vencimento: Date | null, hoje: Date = new Date()): number {
  if (!vencimento) return 0;
  const dias = Math.floor(
    (inicioDoDia(hoje).getTime() - inicioDoDia(vencimento).getTime()) / 86_400_000,
  );
  return dias > 0 ? dias : 0;
}

/** Passou da janela de reemissão — a emissão deixa de ser permitida. */
export function foraDoPrazoDeReemissao(
  vencimento: Date | null,
  hoje: Date = new Date(),
  prazoMaximoDias: number = PRAZO_MAXIMO_REEMISSAO_DIAS,
): boolean {
  return diasEmAtraso(vencimento, hoje) > prazoMaximoDias;
}

export type EncargosCalculados = {
  /** Valor a cobrar: saldo + multa + juros. É o que vai no código de barras. */
  valor: number;
  saldo: number;
  multa: number;
  juros: number;
  diasAtraso: number;
  /** Data até a qual o valor vale — o encargo muda a cada dia. */
  atualizadoAte: Date;
};

/**
 * Valor atualizado do título até hoje.
 *
 * - **Multa**: o valor em reais do título, aplicado uma única vez a partir do
 *   primeiro dia de atraso.
 * - **Juros**: o valor por dia de atraso do título, multiplicado pelos dias.
 *
 * **Só o valor do ERP** (decisão do usuário, 2026-10-09): `multaValor` e
 * `jurosValorDia`, o que o Protheus calculou e imprimiu no boleto original. O
 * percentual da conta bancária não entra mais — título sem valor do ERP não
 * tem encargo, e a conta devolve o próprio saldo. Inventar encargo cobraria do
 * cliente um valor que o boleto na mão dele não diz.
 *
 * Tudo é arredondado ao centavo no fim, e não a cada parcela, para o total
 * impresso bater com a soma das linhas do demonstrativo.
 */
export function calcularEncargos(entrada: {
  saldo: number;
  vencimento: Date | null;
  /** Multa em reais, como o ERP calculou. */
  multaValor?: number | null;
  /** Juros por dia de atraso, em reais, como o ERP calculou. */
  jurosValorDia?: number | null;
  hoje?: Date;
}): EncargosCalculados {
  const hoje = inicioDoDia(entrada.hoje ?? new Date());
  const diasAtraso = diasEmAtraso(entrada.vencimento, hoje);
  const saldo = centavos(entrada.saldo);

  if (diasAtraso === 0) {
    return { valor: saldo, saldo, multa: 0, juros: 0, diasAtraso: 0, atualizadoAte: hoje };
  }

  const multa = centavos(entrada.multaValor ?? 0);
  const juros = centavos((entrada.jurosValorDia ?? 0) * diasAtraso);

  return {
    valor: centavos(saldo + multa + juros),
    saldo,
    multa,
    juros,
    diasAtraso,
    atualizadoAte: hoje,
  };
}

/** Arredonda ao centavo, evitando o resíduo de ponto flutuante. */
function centavos(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Condição para oferecer a 2ª via do boleto.
 *
 * Mora aqui, e não no service, porque **três lugares** precisam da mesma
 * resposta: a lista de títulos, a Posição de Cliente e a própria rota de
 * emissão. Se divergirem, a tela oferece um botão que a rota recusa com 409 —
 * e o vendedor descobre isso na frente do cliente.
 */
export function podeEmitirBoleto(
  titulo: {
    nossoNumero: string | null;
    contaBancariaId?: string | null;
    dtBaixa?: Date | null;
    vencimento: Date | null;
  },
  temContaPadrao: boolean,
  hoje: Date = new Date(),
  prazoMaximoDias: number = PRAZO_MAXIMO_REEMISSAO_DIAS,
): boolean {
  // Sem nosso número o boleto não foi registrado no banco; fora da janela, a emissão está encerrada.
  if (!titulo.nossoNumero) return false;
  if (foraDoPrazoDeReemissao(titulo.vencimento, hoje, prazoMaximoDias)) return false;
  return !!titulo.contaBancariaId || temContaPadrao;
}

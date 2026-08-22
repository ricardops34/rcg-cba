/**
 * Código de barras e linha digitável do boleto (FEBRABAN + campo livre do
 * Bradesco).
 *
 * Módulo puro, sem Prisma e sem Nest: é a parte que, se errar por um dígito,
 * produz um boleto que o cliente tenta pagar e o caixa recusa — e o vendedor
 * só descobre pelo telefone do cliente. Fica isolado para poder ser conferido
 * contra um boleto real do banco sem subir nada.
 *
 * A plataforma **reimprime**: quem registrou o título no banco foi o ERP, e é
 * dele que vem o nosso número. Nada aqui numera nem registra.
 */

/** Bancos com campo livre implementado. Ver `bancoBoletoSchema` nos contracts. */
export const BANCOS_SUPORTADOS = ['237'] as const;

export class BoletoInvalidoError extends Error {}

const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
const zeros = (valor: string, tamanho: number) => valor.padStart(tamanho, '0');

/**
 * Fator de vencimento: dias corridos entre a data-base da FEBRABAN
 * (07/10/1997) e o vencimento.
 *
 * O campo tem 4 posições, então o fator esgotou em **21/02/2025** (dia 9999).
 * A FEBRABAN não ampliou o campo: determinou o **reinício em 1000** no dia
 * seguinte. Daí o ciclo de 9000 aplicado só depois de 9999 — títulos vencidos
 * antes disso (a base tem muitos) continuam usando o fator linear antigo, que
 * é o que está impresso no boleto original deles.
 */
export function fatorVencimento(vencimento: Date): number {
  const base = Date.UTC(1997, 9, 7);
  const dia = Date.UTC(
    vencimento.getUTCFullYear(),
    vencimento.getUTCMonth(),
    vencimento.getUTCDate(),
  );
  const dias = Math.floor((dia - base) / 86_400_000);
  if (dias < 1000) {
    throw new BoletoInvalidoError(
      'Vencimento anterior a 03/07/2000 não tem fator de vencimento válido.',
    );
  }
  return dias <= 9999 ? dias : ((dias - 10_000) % 9000) + 1000;
}

/**
 * Módulo 11 com pesos 2..9 — o dígito verificador geral do código de barras
 * (5ª posição). Resto 0, 1 ou 10 vira dígito 1, regra própria da FEBRABAN.
 */
export function dvGeralCodigoBarras(barrasSemDv: string): number {
  let peso = 2;
  let soma = 0;
  for (let i = barrasSemDv.length - 1; i >= 0; i--) {
    soma += Number(barrasSemDv[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

/** Módulo 10 (pesos 2 e 1 alternados, da direita) — DV de cada campo da linha digitável. */
export function dvModulo10(campo: string): number {
  let peso = 2;
  let soma = 0;
  for (let i = campo.length - 1; i >= 0; i--) {
    const produto = Number(campo[i]) * peso;
    soma += produto > 9 ? produto - 9 : produto;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

/**
 * DV do nosso número no Bradesco: módulo 11 com pesos 2..7 sobre
 * carteira + nosso número. Resto 1 vira "P" — é o único DV alfabético do
 * boleto, e é impresso na ficha; **não** entra no código de barras.
 */
export function dvNossoNumeroBradesco(
  carteira: string,
  nossoNumero: string,
): string {
  const base = `${zeros(soDigitos(carteira), 2)}${zeros(soDigitos(nossoNumero), 11)}`;
  let peso = 2;
  let soma = 0;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 7 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  if (resto === 0) return '0';
  if (resto === 1) return 'P';
  return String(11 - resto);
}

/**
 * Campo livre do Bradesco (posições 20 a 44 do código de barras):
 * agência (4) + carteira (2) + nosso número (11) + conta (7) + zero.
 *
 * A conta entra **sem** o dígito verificador e o nosso número **sem** o "P" —
 * os dois aparecem só na parte impressa da ficha.
 */
export function campoLivreBradesco(dados: {
  agencia: string;
  carteira: string;
  nossoNumero: string;
  conta: string;
}): string {
  const agencia = soDigitos(dados.agencia);
  const carteira = soDigitos(dados.carteira);
  const nossoNumero = soDigitos(dados.nossoNumero);
  const conta = soDigitos(dados.conta);

  if (agencia.length > 4)
    throw new BoletoInvalidoError('Agência com mais de 4 dígitos.');
  if (carteira.length > 2)
    throw new BoletoInvalidoError('Carteira com mais de 2 dígitos.');
  if (nossoNumero.length > 11)
    throw new BoletoInvalidoError(
      'Nosso número com mais de 11 dígitos (Bradesco).',
    );
  if (conta.length > 7)
    throw new BoletoInvalidoError('Conta com mais de 7 dígitos.');

  return (
    zeros(agencia, 4) +
    zeros(carteira, 2) +
    zeros(nossoNumero, 11) +
    zeros(conta, 7) +
    '0'
  );
}

/** Converte o código de barras (44) na linha digitável (47), com os 3 DVs de campo. */
export function linhaDigitavelDeBarras(codigoBarras: string): string {
  if (!/^\d{44}$/.test(codigoBarras)) {
    throw new BoletoInvalidoError('Código de barras deve ter 44 dígitos.');
  }
  const banco = codigoBarras.slice(0, 3);
  const moeda = codigoBarras.slice(3, 4);
  const dvGeral = codigoBarras.slice(4, 5);
  const fatorValor = codigoBarras.slice(5, 19);
  const livre = codigoBarras.slice(19);

  const campo1 = `${banco}${moeda}${livre.slice(0, 5)}`;
  const campo2 = livre.slice(5, 15);
  const campo3 = livre.slice(15, 25);

  return [
    `${campo1}${dvModulo10(campo1)}`,
    `${campo2}${dvModulo10(campo2)}`,
    `${campo3}${dvModulo10(campo3)}`,
    dvGeral,
    fatorValor,
  ].join('');
}

/** Linha digitável com a pontuação do papel (5 blocos, como o caixa espera ler). */
export function formatarLinhaDigitavel(linha: string): string {
  const d = soDigitos(linha);
  if (d.length !== 47) return linha;
  return [
    `${d.slice(0, 5)}.${d.slice(5, 10)}`,
    `${d.slice(10, 15)}.${d.slice(15, 21)}`,
    `${d.slice(21, 26)}.${d.slice(26, 32)}`,
    d.slice(32, 33),
    d.slice(33),
  ].join(' ');
}

export type BoletoEntrada = {
  banco: string;
  agencia: string;
  conta: string;
  carteira: string;
  nossoNumero: string;
  vencimento: Date | null;
  valor: number;
  /** Código de barras já registrado pelo ERP — quando existe, manda nele. */
  codigoBarrasErp?: string | null;
  linhaDigitavelErp?: string | null;
};

export type BoletoCalculado = {
  codigoBarras: string;
  linhaDigitavel: string;
  linhaDigitavelFormatada: string;
  nossoNumeroFormatado: string;
  /** true quando os dados vieram prontos do ERP, sem cálculo local. */
  doErp: boolean;
};

/**
 * Monta (ou aproveita) o código de barras e a linha digitável do título.
 *
 * **O que o ERP mandou prevalece.** Se o código de barras registrado veio no
 * título, é ele que sai impresso: recalcular e divergir do que o banco tem
 * registrado seria emitir uma 2ª via diferente do boleto original — pior do
 * que não emitir. O cálculo local é o caminho de quem só mandou o nosso
 * número, que é o caso normal.
 */
export function montarBoleto(entrada: BoletoEntrada): BoletoCalculado {
  const banco = zeros(soDigitos(entrada.banco), 3);
  if (!(BANCOS_SUPORTADOS as readonly string[]).includes(banco)) {
    throw new BoletoInvalidoError(
      `Banco ${banco} não tem gerador de boleto implementado (hoje só Bradesco/237).`,
    );
  }
  if (!soDigitos(entrada.nossoNumero)) {
    throw new BoletoInvalidoError(
      'Título sem nosso número: o boleto não foi registrado no banco pelo ERP.',
    );
  }

  const nossoNumeroFormatado = [
    zeros(soDigitos(entrada.carteira), 2),
    '/',
    zeros(soDigitos(entrada.nossoNumero), 11),
    '-',
    dvNossoNumeroBradesco(entrada.carteira, entrada.nossoNumero),
  ].join('');

  const barrasErp = soDigitos(entrada.codigoBarrasErp);
  if (barrasErp.length === 44) {
    const linhaErp = soDigitos(entrada.linhaDigitavelErp);
    const linhaDigitavel =
      linhaErp.length === 47 ? linhaErp : linhaDigitavelDeBarras(barrasErp);
    return {
      codigoBarras: barrasErp,
      linhaDigitavel,
      linhaDigitavelFormatada: formatarLinhaDigitavel(linhaDigitavel),
      nossoNumeroFormatado,
      doErp: true,
    };
  }

  if (!entrada.vencimento) {
    throw new BoletoInvalidoError('Título sem vencimento não gera boleto.');
  }
  if (!(entrada.valor > 0)) {
    throw new BoletoInvalidoError('Título sem valor em aberto não gera boleto.');
  }

  const fator = zeros(String(fatorVencimento(entrada.vencimento)), 4);
  // Arredondamento explícito: `1260.5 * 100` dá 126049.99999... em ponto
  // flutuante, e truncar comeria um centavo do cliente — divergindo do valor
  // registrado no banco.
  const centavos = String(Math.round(entrada.valor * 100));
  if (centavos.length > 10) {
    throw new BoletoInvalidoError('Valor acima do máximo do código de barras.');
  }

  const livre = campoLivreBradesco({
    agencia: entrada.agencia,
    carteira: entrada.carteira,
    nossoNumero: entrada.nossoNumero,
    conta: entrada.conta,
  });

  const semDv = `${banco}9${fator}${zeros(centavos, 10)}${livre}`;
  const codigoBarras = [
    banco,
    '9',
    String(dvGeralCodigoBarras(semDv)),
    fator,
    zeros(centavos, 10),
    livre,
  ].join('');
  const linhaDigitavel = linhaDigitavelDeBarras(codigoBarras);

  return {
    codigoBarras,
    linhaDigitavel,
    linhaDigitavelFormatada: formatarLinhaDigitavel(linhaDigitavel),
    nossoNumeroFormatado,
    doErp: false,
  };
}

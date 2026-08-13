import { MAX_MESES_CONSULTA, emMeses, totalDeMeses } from "@plataforma/contracts";

/**
 * Período e opções comuns às telas do módulo Consultas (tabela pivô e gráfico
 * de evolução): as duas têm a mesma cortina de parâmetros de mês/ano, e a
 * mesma regra de período do servidor precisa valer nas duas.
 */

/** Valor "todos" dos selects — Radix não aceita SelectItem com value="". */
export const TODOS = "todos";

/**
 * "padrao" = respeita o parâmetro CONSULTA_VENDAS_BASE_VENDEDOR da empresa;
 * as outras opções sobrescrevem só naquela consulta.
 */
export const PADRAO_EMPRESA = "padrao";

/** As quatro pontas do período, como estão nos selects (string). */
export interface PeriodoFiltros {
  anoInicial: string;
  mesInicial: string;
  anoFinal: string;
  mesFinal: string;
}

/** Últimos 6 anos + o atual, do mais recente para o mais antigo. */
export function anosDisponiveis(): number[] {
  const atual = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, i) => atual - i);
}

/** Período padrão: os 12 meses que terminam no mês corrente. */
export function periodoPadrao(): PeriodoFiltros {
  const hoje = new Date();
  const fim = { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };
  const inicioEmMeses = emMeses(fim.ano, fim.mes) - (MAX_MESES_CONSULTA - 1);
  // emMeses = ano*12 + mes, com mes de 1 a 12: desfazer a conta exige tratar
  // o mês 12 como resto 0 do ano anterior.
  const ano = Math.floor((inicioEmMeses - 1) / 12);
  const mes = inicioEmMeses - ano * 12;
  return {
    anoInicial: String(ano),
    mesInicial: String(mes),
    anoFinal: String(fim.ano),
    mesFinal: String(fim.mes),
  };
}

/** Quantos meses o rascunho da cortina cobre. */
export function mesesDoPeriodo(f: PeriodoFiltros): number {
  return totalDeMeses({
    anoInicial: Number(f.anoInicial),
    mesInicial: Number(f.mesInicial),
    anoFinal: Number(f.anoFinal),
    mesFinal: Number(f.mesFinal),
  });
}

/**
 * Mensagem de erro do período, ou null se estiver válido — a mesma regra do
 * back-end (validarPeriodo), rodada aqui para o usuário ver o problema antes
 * de disparar a consulta.
 */
export function erroDoPeriodo(f: PeriodoFiltros): string | null {
  const meses = mesesDoPeriodo(f);
  if (meses < 1) return "O fim do período não pode ser anterior ao início.";
  if (meses > MAX_MESES_CONSULTA)
    return `O período não pode passar de ${MAX_MESES_CONSULTA} meses (escolhido: ${meses}).`;
  return null;
}

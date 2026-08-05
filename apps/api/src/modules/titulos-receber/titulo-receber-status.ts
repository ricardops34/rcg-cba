import type { TituloReceberStatus } from '@plataforma/contracts';

/**
 * baixado: tem dtBaixa; vencido: sem baixa e vencimento no passado; aberto:
 * os demais. Compartilhado entre TitulosReceberService e a Posição de
 * Cliente (ClientesService.posicao) — mesma regra nos dois lugares.
 */
export function calcularStatusTituloReceber(
  titulo: { dtBaixa: Date | null; vencimento: Date | null },
  hoje: Date,
): TituloReceberStatus {
  if (titulo.dtBaixa) return 'baixado';
  if (titulo.vencimento && titulo.vencimento.getTime() < hoje.getTime())
    return 'vencido';
  return 'aberto';
}

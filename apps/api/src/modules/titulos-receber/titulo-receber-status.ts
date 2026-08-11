import type { TituloReceberStatus } from '@plataforma/contracts';

/**
 * Meia-noite de hoje em UTC. Vencimento vem do ERP como data pura (gravada
 * como 00:00 UTC), então comparar com `new Date()` cru marcaria como vencido
 * todo título que vence HOJE — basta passar da meia-noite. Truncar aqui, em
 * UTC, mantém a conta certa independente do fuso do container.
 */
export function inicioDoDia(agora: Date = new Date()): Date {
  return new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()),
  );
}

/**
 * baixado: tem dtBaixa; vencido: sem baixa e vencimento ANTERIOR a hoje (quem
 * vence hoje ainda está em aberto); aberto: os demais. Compartilhado entre
 * TitulosReceberService e a Posição de Cliente (ClientesService.posicao) —
 * mesma regra nos dois lugares. `hoje` deve vir de `inicioDoDia()`.
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

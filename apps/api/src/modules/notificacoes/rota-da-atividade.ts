/**
 * Início do título da pendência que o pedido de liberação de desconto abre na
 * agenda do superior (ver `registrarAtividadeOrcamento`).
 */
export const PREFIXO_PENDENCIA_DESCONTO = 'Autorização de desconto solicitada';

/**
 * O pedido de liberação abre o orçamento na aba "Aprovação e integração".
 * Autorizar e Recusar ficam no aviso de desconto acima das abas, então estão à
 * mão em qualquer aba; esta é a que mostra a situação da aprovação.
 */
export function rotaLiberacaoDesconto(orcamentoId: string): string {
  return `/crm/orcamentos/${orcamentoId}?aba=integracao`;
}

/**
 * Para onde o aviso de "tarefa vencendo" leva.
 *
 * A pendência de liberação de desconto abre o **orçamento**, onde estão
 * Autorizar e Recusar — na tela da atividade o superior não tem o que fazer
 * (decisão de 2026-11-16). As demais tarefas abrem a própria atividade.
 */
export function rotaDaAtividade(atividade: {
  id: string;
  titulo: string;
  orcamentoId: string | null;
}): string {
  if (
    atividade.orcamentoId &&
    atividade.titulo.startsWith(PREFIXO_PENDENCIA_DESCONTO)
  ) {
    return rotaLiberacaoDesconto(atividade.orcamentoId);
  }
  return `/crm/atividades/${atividade.id}`;
}

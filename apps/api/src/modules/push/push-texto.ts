import type { NotificacaoTipo } from '@prisma/client';

/**
 * Título do aviso no celular, por tipo.
 *
 * Genérico de propósito: o aviso aparece na tela bloqueada, à vista de quem
 * pegar o aparelho. Valor, desconto e nome de cliente ficam dentro do app —
 * tocar no aviso abre a tela, e lá o login e a permissão valem como sempre.
 *
 * `null` = o tipo não vai para o celular. Mensagem de WhatsApp tem o ícone
 * próprio e volume alto (decisão de 2026-10-08 para o sino, mantida aqui).
 *
 * `Record` com todos os tipos: um tipo novo no enum só compila com a decisão
 * de avisar ou não tomada aqui.
 */
export const TITULO_PUSH: Record<NotificacaoTipo, string | null> = {
  whatsapp_mensagem: null,
  whatsapp_agendamento_erro: 'Uma mensagem agendada não foi enviada',
  atividade_vencimento: 'Você tem atividade vencendo',
  orcamento_aprovado: 'Um orçamento foi aprovado',
  orcamento_recusado: 'Um orçamento foi recusado',
  cliente_atribuido: 'Um cliente foi atribuído a você',
  titulo_vencido: 'Um cliente da sua carteira tem título vencido',
  whatsapp_aguardando: 'Cliente aguardando atendimento no WhatsApp',
  lead_novo: 'Novo lead aguardando',
  desconto_pendente: 'Desconto aguardando sua liberação',
  desconto_liberado: 'Seu pedido de desconto foi liberado',
  desconto_recusado: 'Seu pedido de desconto foi recusado',
  recado_interno: 'Novo recado da equipe',
  sugestao_compra_calculada: 'A sugestão de compra terminou',
  clientes_receita_atualizados: 'A atualização dos clientes terminou',
  atendimento_agendado: 'Hora de um atendimento agendado',
  atendimento_nao_realizado: 'Um atendimento agendado não foi feito',
  roteiro_confirmar: 'Confirme o roteiro de hoje',
  roteiro_iniciado: 'Um atendimento do roteiro começou',
  roteiro_cancelado: 'Atendimentos do roteiro cancelados',
  roteiro_atraso: 'Atendimento do roteiro em atraso',
};

/** O que o service worker recebe (ver `apps/web/public/sw.js`). */
export interface PushPayload {
  titulo: string;
  corpo: string;
  /** Rota interna que o toque abre; só caminho relativo. */
  rota: string;
  /** Agrupa: um aviso novo da mesma origem substitui o anterior. */
  tag: string;
}

/** Rota interna e só ela: nada de URL absoluta vinda do dado. */
export function rotaSegura(rota: string | null | undefined): string {
  if (!rota || !rota.startsWith('/') || rota.startsWith('//')) return '/';
  return rota;
}

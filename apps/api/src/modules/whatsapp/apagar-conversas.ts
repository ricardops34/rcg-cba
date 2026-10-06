import type { TenantTx } from '../../common/prisma/prisma.service';

/**
 * Apaga conversas de WhatsApp e tudo o que é delas.
 *
 * Ponto único das três exclusões do histórico (uma conversa, o histórico de
 * uma instância, a instância com o histórico), todas atrás de
 * `whatsapp-historico.excluir` — o histórico é permanente para todo o resto.
 *
 * Pelo cascade do banco vão junto mensagens, reações, agendamentos e o
 * registro de ações enviadas. Duas coisas não têm FK e precisam ser tratadas
 * aqui:
 * - a notificação do sino guarda o id da conversa em `referenciaId`: sem
 *   apagar, o sino levaria a uma conversa que não existe;
 * - o lead guarda `conversaId`: ele **fica** (é dado comercial, com
 *   distribuição e anotações de alguém), só perde o ponteiro.
 *
 * As atividades no histórico do cliente ficam: são por cliente e por dia, e
 * não apontam para a conversa.
 */
export async function apagarConversas(tx: TenantTx, ids: string[]) {
  if (ids.length === 0) return { conversas: 0, mensagens: 0 };

  // Contado antes: depois do delete não há o que contar, e o número é o que a
  // tela devolve a quem confirmou.
  const mensagens = await tx.whatsappMensagem.count({
    where: { conversaId: { in: ids } },
  });

  await tx.notificacao.deleteMany({ where: { referenciaId: { in: ids } } });
  await tx.lead.updateMany({
    where: { conversaId: { in: ids } },
    data: { conversaId: null },
  });
  const { count } = await tx.whatsappConversa.deleteMany({
    where: { id: { in: ids } },
  });

  return { conversas: count, mensagens };
}

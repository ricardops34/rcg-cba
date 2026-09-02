import type { TenantTx } from '../prisma/prisma.service';

/**
 * O atendimento por WhatsApp no histórico do cliente.
 *
 * A rotina de Atividades é o histórico de atendimento visto pelo lado do
 * vendedor: o que ele fez, em ordem. Conversar com o cliente é o atendimento
 * mais frequente de todos e era justamente o que não aparecia ali — 2ª via,
 * orçamento e agendamento já entram por `registrarAtividadeDocumento` e
 * `registrarAtividadeOrcamento`.
 *
 * **Um registro por cliente por dia**, e não por mensagem: uma conversa de
 * meia hora vira trinta linhas iguais no histórico, que deixa de ser
 * consultável exatamente no cliente mais atendido. O primeiro contato do dia
 * cria a atividade; os seguintes só atualizam a contagem, que é lida do banco
 * (nunca somada em cima do texto anterior) — então reenvio da reconexão do
 * aparelho não infla número nenhum.
 *
 * Entra concluída e sem vencimento, como os demais registros do que já
 * aconteceu: é histórico, não tarefa pendente na agenda de ninguém.
 *
 * **Nunca derruba a mensagem.** Quem chama grava depois de a mensagem existir,
 * e conversa de contato sem cliente vinculado não gera atividade — não há a
 * quem atribuí-la, e o módulo nem guarda o conteúdo nesse caso.
 */
const TITULO = 'Atendimento por WhatsApp';

export interface AtendimentoParaAtividade {
  empresaId: string;
  /** Usuário que atendeu. Nulo quando a mensagem chegou pelo worker. */
  autor: string | null;
  clienteId: string | null;
  vendedorId: string;
  /** Quando a mensagem aconteceu — decide a qual dia o registro pertence. */
  quando: Date;
}

export async function registrarAtendimentoWhatsapp(
  tx: TenantTx,
  atendimento: AtendimentoParaAtividade,
): Promise<boolean> {
  const { empresaId, autor, clienteId, vendedorId } = atendimento;
  if (!clienteId) return false;

  const inicio = new Date(atendimento.quando);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 1);

  // A contagem é do **cliente** no dia, não da conversa: o mesmo cliente pode
  // escrever de dois números, e o registro do dia é um só.
  const doCliente = {
    empresaId,
    conversa: { clienteId, sessao: { vendedorId } },
    criadaEm: { gte: inicio, lt: fim },
  };
  const [enviadas, recebidas] = await Promise.all([
    tx.whatsappMensagem.count({ where: { ...doCliente, direcao: 'saida' } }),
    tx.whatsappMensagem.count({ where: { ...doCliente, direcao: 'entrada' } }),
  ]);

  const descricao = [
    enviadas ? `${enviadas} enviada${enviadas > 1 ? 's' : ''}` : null,
    recebidas ? `${recebidas} recebida${recebidas > 1 ? 's' : ''}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // O casamento é por cliente + vendedor + dia, com o título fixo: a Atividade
  // não tem coluna de origem, e criar uma só para isto colocaria o histórico
  // do cliente em dois lugares que divergiriam (ver
  // `registrarAtividadeDocumento`).
  const doDia = await tx.atividade.findFirst({
    where: {
      empresaId,
      clienteId,
      vendedorId,
      titulo: TITULO,
      deletedAt: null,
      dataConclusao: { gte: inicio, lt: fim },
    },
    select: { id: true },
  });

  if (doDia) {
    await tx.atividade.update({
      where: { id: doDia.id },
      data: { descricao: descricao || null, updatedBy: autor },
    });
    return true;
  }

  await tx.atividade.create({
    data: {
      empresaId,
      clienteId,
      vendedorId,
      tipo: 'tarefa',
      titulo: TITULO,
      descricao: descricao || null,
      dataVencimento: null,
      concluida: true,
      dataConclusao: atendimento.quando,
      createdBy: autor,
      updatedBy: autor,
    },
  });
  return true;
}

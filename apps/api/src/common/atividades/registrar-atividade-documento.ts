import type { TenantTx } from '../prisma/prisma.service';

/**
 * Rastro da 2ª via no histórico de atendimento do cliente.
 *
 * Mesmo mecanismo que o orçamento já usa (`registrarAtividadeOrcamento`): cada
 * passo relevante do atendimento vira uma **Atividade concluída**, ligada ao
 * cliente, e é isso que aparece em CRM › Atividades / Agenda filtrando por
 * cliente. Não há uma segunda "tabela de histórico de atendimento" — criar uma
 * faria o histórico do cliente morar em dois lugares que divergiriam.
 *
 * Entram concluídas e sem data de vencimento: são registro do que já
 * aconteceu, não tarefa pendente na agenda de ninguém.
 *
 * **O registro nunca derruba a entrega do documento.** Quem chama grava depois
 * de o PDF existir, e um cliente sem vendedor cadastrado simplesmente não gera
 * atividade (`vendedorId` é obrigatório na Atividade) — perder o rastro é
 * ruim, mas negar ao vendedor o boleto que o cliente está esperando é pior.
 */
export type EventoDocumento =
  | 'titulos_whatsapp'
  | 'notas_whatsapp'
  | 'danfe_gerado'
  | 'danfe_whatsapp'
  | 'xml_baixado'
  | 'boleto_gerado'
  | 'boleto_whatsapp';

const TITULO: Record<EventoDocumento, (numero: string) => string> = {
  // Os dois relatórios não têm número de documento: o que sai é a lista do
  // cliente inteira, e o que ela tinha vai na descrição.
  titulos_whatsapp: () => 'Títulos em aberto enviados pelo WhatsApp',
  notas_whatsapp: () => 'Últimas notas fiscais enviadas pelo WhatsApp',
  danfe_gerado: (n) => `2ª via do DANFE gerada — NF ${n}`,
  danfe_whatsapp: (n) => `DANFE enviado pelo WhatsApp — NF ${n}`,
  xml_baixado: (n) => `XML da NF ${n} baixado`,
  boleto_gerado: (n) => `2ª via de boleto gerada — título ${n}`,
  boleto_whatsapp: (n) => `Boleto enviado pelo WhatsApp — título ${n}`,
};

export interface DocumentoParaAtividade {
  empresaId: string;
  /**
   * Usuário que executou — responde pela ação (vai em createdBy).
   *
   * Nulo quando não há usuário: é o caso do documento que o **cliente** pede
   * pelo WhatsApp institucional, onde quem age é o atendimento automático. A
   * coluna sempre aceitou nulo; o tipo é que era mais estreito que ela, e
   * inventar um autor poria o nome de alguém numa ação que a pessoa não fez.
   */
  autor: string | null;
  evento: EventoDocumento;
  clienteId: string | null;
  /**
   * Vendedor do documento (nota/título). Nulo cai no vendedor do cadastro do
   * cliente: a atividade precisa ficar na carteira em que o histórico é
   * consultado, não na de quem por acaso clicou.
   */
  vendedorId: string | null;
  /**
   * Número visível do documento — NF ou título, como sai impresso. Os eventos
   * de relatório (`titulos_whatsapp`, `notas_whatsapp`) não usam.
   */
  numero: string;
  /** Uma linha com o que importa: valor, vencimento, encargo aplicado. */
  descricao?: string;
}

/** Grava a atividade. Devolve false quando não houve vendedor a quem atribuir. */
export async function registrarAtividadeDocumento(
  tx: TenantTx,
  documento: DocumentoParaAtividade,
): Promise<boolean> {
  const { empresaId, autor, evento, clienteId, numero } = documento;
  if (!clienteId) return false;

  let vendedorId = documento.vendedorId;
  if (!vendedorId) {
    const cliente = await tx.cliente.findFirst({
      where: { id: clienteId, empresaId },
      select: { vendedorId: true },
    });
    vendedorId = cliente?.vendedorId ?? null;
  }
  if (!vendedorId) return false;

  const agora = new Date();
  await tx.atividade.create({
    data: {
      empresaId,
      clienteId,
      vendedorId,
      tipo: 'tarefa',
      titulo: TITULO[evento](numero),
      descricao: documento.descricao ?? null,
      dataVencimento: null,
      concluida: true,
      dataConclusao: agora,
      createdBy: autor,
      updatedBy: autor,
    },
  });
  return true;
}

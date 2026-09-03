import type { TenantTx } from '../../common/prisma/prisma.service';
import {
  registrarNotificacao,
  usuarioDoVendedor,
} from '../notificacoes/registrar-notificacao';

/**
 * Rastro do orçamento na Agenda/Atividades. Cada passo relevante do
 * atendimento vira uma Atividade vinculada ao orçamento e ao cliente, e é o
 * que a aba Histórico do formulário mostra em ordem — quem alterou, quando a
 * proposta foi impressa, quando o cliente respondeu e quem liberou o desconto.
 *
 * Fora `autorizacao_solicitada`, todos são registros do que já aconteceu:
 * entram concluídos, sem data de vencimento, para não virarem tarefa pendente
 * na Agenda de ninguém. A solicitação de autorização é a exceção — ela é uma
 * pendência de verdade, endereçada a quem pode liberar.
 */
export type EventoOrcamento =
  | 'criacao'
  | 'alteracao'
  | 'pdf'
  | 'envio_whatsapp'
  | 'aprovacao_cliente'
  | 'recusa_cliente'
  | 'autorizacao_solicitada'
  | 'autorizacao_concedida';

const TITULO: Record<EventoOrcamento, (numero: number) => string> = {
  criacao: (n) => `Orçamento nº ${n} cadastrado`,
  alteracao: (n) => `Orçamento nº ${n} alterado`,
  pdf: (n) => `Proposta em PDF gerada — orçamento nº ${n}`,
  envio_whatsapp: (n) => `Proposta enviada pelo WhatsApp — orçamento nº ${n}`,
  aprovacao_cliente: (n) => `Orçamento nº ${n} aprovado pelo cliente`,
  recusa_cliente: (n) => `Orçamento nº ${n} recusado pelo cliente`,
  autorizacao_solicitada: (n) =>
    `Autorização de desconto solicitada — orçamento nº ${n}`,
  autorizacao_concedida: (n) => `Desconto autorizado — orçamento nº ${n}`,
};

export interface OrcamentoParaAtividade {
  id: string;
  numero: number;
  titulo: string;
  clienteId: string;
  vendedorId: string;
  oportunidadeId: string | null;
}

export async function registrarAtividadeOrcamento(
  tx: TenantTx,
  empresaId: string,
  autor: string,
  evento: EventoOrcamento,
  orcamento: OrcamentoParaAtividade,
  descricao?: string,
) {
  const pendencia = evento === 'autorizacao_solicitada';
  const agora = new Date();

  // A pendência de autorização é endereçada a quem cobra o vendedor —
  // supervisor, ou gerente quando não houver supervisor. Sem hierarquia
  // cadastrada, fica com o próprio vendedor: melhor uma pendência visível na
  // agenda dele do que uma atividade órfã.
  let vendedorDestino = orcamento.vendedorId;
  if (pendencia) {
    const vendedor = await tx.vendedor.findFirst({
      where: { id: orcamento.vendedorId, empresaId },
      select: { superiorId: true },
    });
    // Sobe um degrau na hierarquia: quem responde pelo vendedor. Sem superior
    // cadastrado, a pendência fica com ele mesmo — melhor visível na agenda
    // dele do que órfã.
    vendedorDestino = vendedor?.superiorId ?? orcamento.vendedorId;
  }

  await tx.atividade.create({
    data: {
      empresaId,
      clienteId: orcamento.clienteId,
      oportunidadeId: orcamento.oportunidadeId,
      orcamentoId: orcamento.id,
      vendedorId: vendedorDestino,
      tipo: 'tarefa',
      titulo: TITULO[evento](orcamento.numero),
      descricao: descricao ?? orcamento.titulo,
      dataVencimento: pendencia ? agora : null,
      concluida: !pendencia,
      dataConclusao: pendencia ? null : agora,
      createdBy: autor,
      updatedBy: autor,
    },
  });

  // A resposta do cliente também vai para o sino do vendedor dono. Fica aqui,
  // e não em quem chama, porque este é o funil por onde os dois caminhos
  // passam — a tela de orçamentos e as ações de dentro da conversa.
  const tipo =
    evento === 'aprovacao_cliente'
      ? ('orcamento_aprovado' as const)
      : evento === 'recusa_cliente'
        ? ('orcamento_recusado' as const)
        : null;
  const usuarioId = tipo
    ? await usuarioDoVendedor(tx, empresaId, orcamento.vendedorId)
    : null;
  if (tipo && usuarioId) {
    await registrarNotificacao(tx, {
      empresaId,
      usuarioId,
      tipo,
      titulo: TITULO[evento](orcamento.numero),
      descricao: orcamento.titulo,
      rota: `/crm/orcamentos/${orcamento.id}`,
      referenciaId: orcamento.id,
      // Quem registrou a resposta do cliente não precisa ser avisado dela;
      // o aviso existe para quando **outra pessoa** (supervisor, integração)
      // mexe no orçamento de um vendedor.
      autorUsuarioId: autor,
    });
  }
}

/**
 * O orçamento tem alguma linha com desconto igual ou acima do "% Desc Máximo"
 * da regra aplicada? É essa condição que exige autorização antes de gerar a
 * proposta em PDF ou efetivar (aprovar) o orçamento.
 *
 * Lê o que está gravado nos itens (percDesconto + regra aplicada), e não o que
 * veio na requisição: o que trava é o orçamento como está no banco.
 */
export async function orcamentoExigeAutorizacao(
  tx: TenantTx,
  orcamentoId: string,
): Promise<boolean> {
  const itens = await tx.orcamentoItem.findMany({
    where: { orcamentoId },
    select: {
      percDesconto: true,
      regraDesconto: { select: { percDescontoMaximo: true } },
    },
  });
  return itens.some(
    (i) =>
      i.percDesconto != null &&
      i.percDesconto > 0 &&
      i.regraDesconto != null &&
      i.percDesconto >= i.regraDesconto.percDescontoMaximo,
  );
}

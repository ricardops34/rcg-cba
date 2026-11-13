import { Prisma } from '@prisma/client';
import { numeroOrcamento } from '@plataforma/contracts';
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
  | 'link_gerado'
  | 'aprovacao_cliente'
  | 'recusa_cliente'
  | 'autorizacao_solicitada'
  | 'autorizacao_concedida'
  | 'autorizacao_recusada';

const TITULO: Record<EventoOrcamento, (numero: string) => string> = {
  criacao: (n) => `Orçamento nº ${n} cadastrado`,
  alteracao: (n) => `Orçamento nº ${n} alterado`,
  pdf: (n) => `Proposta em PDF gerada — orçamento nº ${n}`,
  envio_whatsapp: (n) => `Proposta enviada pelo WhatsApp — orçamento nº ${n}`,
  link_gerado: (n) => `Link do orçamento nº ${n} gerado para o cliente`,
  // Sem "pelo cliente": o mesmo evento vem do link, do portal e do vendedor
  // efetivando na tela. O canal vai na descrição; quem fez, no autor.
  aprovacao_cliente: (n) => `Orçamento nº ${n} aprovado`,
  recusa_cliente: (n) => `Orçamento nº ${n} recusado`,
  autorizacao_solicitada: (n) =>
    `Autorização de desconto solicitada — orçamento nº ${n}`,
  autorizacao_concedida: (n) => `Desconto autorizado — orçamento nº ${n}`,
  autorizacao_recusada: (n) => `Desconto recusado — orçamento nº ${n}`,
};

export interface OrcamentoParaAtividade {
  id: string;
  numero: number | null;
  /** Nº do pedido, mostrado no histórico do ERP (sem número de proposta). */
  codigoErp?: string | null;
  titulo: string;
  clienteId: string | null;
  vendedorId: string;
  oportunidadeId: string | null;
}

export async function registrarAtividadeOrcamento(
  tx: TenantTx,
  empresaId: string,
  /**
   * Quem executou (vai em createdBy). Nulo quando não há usuário — é o PDF
   * que o **cliente** pede pelo WhatsApp institucional, onde quem age é o
   * atendimento automático. A coluna sempre aceitou nulo.
   */
  autor: string | null,
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

  // O primeiro envio ao cliente fica marcado no orçamento: é a base do tempo
  // entre envio e decisão. Aqui porque é o funil dos dois caminhos (WhatsApp e
  // link). Enviar pelo WhatsApp tira o orçamento de rascunho — antes só o link
  // fazia isso, e o "finalizado × não finalizado" ficava errado.
  if (evento === 'envio_whatsapp' || evento === 'link_gerado') {
    await tx.orcamento.updateMany({
      where: { id: orcamento.id, empresaId, enviadoEm: null },
      data: {
        enviadoEm: agora,
        canalEnvio: evento === 'envio_whatsapp' ? 'whatsapp' : 'link',
      },
    });
    if (evento === 'envio_whatsapp') {
      await tx.orcamento.updateMany({
        where: { id: orcamento.id, empresaId, status: 'rascunho' },
        data: { status: 'enviado' },
      });
    }
  }

  // A decisão do cliente encerra o pedido de liberação — por qualquer canal
  // (tela, link, portal, WhatsApp), todos passam por aqui.
  if (evento === 'aprovacao_cliente' || evento === 'recusa_cliente') {
    await concluirPendenciaAutorizacaoDesconto(
      tx,
      empresaId,
      orcamento.id,
      autor,
    );
  }

  await tx.atividade.create({
    data: {
      empresaId,
      clienteId: orcamento.clienteId,
      oportunidadeId: orcamento.oportunidadeId,
      orcamentoId: orcamento.id,
      vendedorId: vendedorDestino,
      tipo: 'tarefa',
      titulo: TITULO[evento](
        numeroOrcamento({
          numero: orcamento.numero,
          codigoErp: orcamento.codigoErp ?? null,
        }),
      ),
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
        : evento === 'autorizacao_solicitada'
          ? ('desconto_pendente' as const)
          : evento === 'autorizacao_concedida'
            ? ('desconto_liberado' as const)
            : evento === 'autorizacao_recusada'
              ? ('desconto_recusado' as const)
              : null;
  // O pedido de liberação vai para o superior; a resposta, para o vendedor.
  const usuarioId = tipo
    ? await usuarioDoVendedor(
        tx,
        empresaId,
        tipo === 'desconto_pendente' ? vendedorDestino : orcamento.vendedorId,
      )
    : null;
  if (tipo && usuarioId) {
    await registrarNotificacao(tx, {
      empresaId,
      usuarioId,
      tipo,
      titulo: TITULO[evento](
        numeroOrcamento({
          numero: orcamento.numero,
          codigoErp: orcamento.codigoErp ?? null,
        }),
      ),
      descricao: descricao ?? orcamento.titulo,
      // O pedido de liberação abre na Posição de Cliente: o superior decide
      // com os títulos e o histórico do cliente à vista.
      rota:
        tipo === 'desconto_pendente' && orcamento.clienteId
          ? `/comercial/posicao-cliente/${orcamento.clienteId}?aba=liberacoes`
          : `/crm/orcamentos/${orcamento.id}`,
      referenciaId: orcamento.id,
      // Quem registrou a resposta do cliente não precisa ser avisado dela;
      // o aviso existe para quando **outra pessoa** (supervisor, integração)
      // mexe no orçamento de um vendedor.
      autorUsuarioId: autor,
    });
  }
}

/**
 * Fecha a pendência "Autorização de desconto solicitada" do orçamento. Ponto
 * único para todo caminho que torna o pedido resolvido ou sem efeito:
 * autorizar, recusar, alterar o orçamento (que derruba o pedido), o cliente
 * recusar e excluir. Antes só autorizar/recusar fechavam, e as outras saídas
 * deixavam a tarefa "atrasada" na agenda do supervisor para sempre.
 */
export async function concluirPendenciaAutorizacaoDesconto(
  tx: TenantTx,
  empresaId: string,
  orcamentoId: string,
  autor: string | null,
) {
  await tx.atividade.updateMany({
    where: {
      orcamentoId,
      empresaId,
      concluida: false,
      titulo: { startsWith: 'Autorização de desconto solicitada' },
    },
    data: { concluida: true, dataConclusao: new Date(), updatedBy: autor },
  });
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

/**
 * Rastro da autorização de desconto: cada pedido, liberação e recusa, com quem
 * fez, quando e a justificativa. Vem das Atividades que cada etapa grava (ver
 * `TITULO`), e não dos campos do orçamento: a recusa limpa o pedido, e um novo
 * pedido limpa a recusa — os campos só guardam a rodada atual.
 *
 * A justificativa é o que segue o marcador que a própria etapa escreve na
 * descrição ("Justificativa do vendedor:", "Justificativa:", "Motivo:").
 */
const PREFIXO_EVENTO_DESCONTO: Record<string, EventoDesconto> = {
  'Autorização de desconto solicitada': 'solicitada',
  'Desconto autorizado': 'autorizada',
  'Desconto recusado': 'recusada',
};
export type EventoDesconto = 'solicitada' | 'autorizada' | 'recusada';

export async function historicoDescontoOrcamento(
  tx: TenantTx,
  empresaId: string,
  orcamentoId: string,
) {
  const atividades = await tx.atividade.findMany({
    where: {
      empresaId,
      orcamentoId,
      OR: Object.keys(PREFIXO_EVENTO_DESCONTO).map((p) => ({
        titulo: { startsWith: p },
      })),
    },
    select: { titulo: true, descricao: true, createdAt: true, createdBy: true },
    orderBy: { createdAt: 'asc' },
  });
  const nomes = await nomesDosAutores(tx, atividades);
  return atividades.flatMap((a) => {
    const prefixo = Object.keys(PREFIXO_EVENTO_DESCONTO).find((p) =>
      a.titulo.startsWith(p),
    );
    if (!prefixo) return [];
    const justificativa =
      /(?:Justificativa do vendedor|Justificativa|Motivo): ([\s\S]*)$/.exec(
        a.descricao ?? '',
      )?.[1] ?? null;
    return [
      {
        evento: PREFIXO_EVENTO_DESCONTO[prefixo],
        em: a.createdAt,
        por: a.createdBy ? (nomes.get(a.createdBy) ?? null) : null,
        justificativa,
      },
    ];
  });
}

/** Nome dos usuários que gravaram as atividades (createdBy é o id). */
async function nomesDosAutores(
  tx: TenantTx,
  atividades: { createdBy: string | null }[],
) {
  const autores = [
    ...new Set(
      atividades.map((a) => a.createdBy).filter((v): v is string => !!v),
    ),
  ];
  if (autores.length === 0) return new Map<string, string>();
  return new Map(
    (
      await tx.usuario.findMany({
        where: { id: { in: autores } },
        select: { id: true, nome: true },
      })
    ).map((u) => [u.id, u.nome]),
  );
}

/**
 * Quem fez, para o histórico. Além do usuário da plataforma, o autor pode ser
 * o próprio cliente: pelo portal o createdBy é `portal-cliente:<contato>`; pelo
 * link e pelo atendimento automático do WhatsApp não há autor (nulo), e a
 * descrição gravada pelo link diz "(pelo link ...)".
 */
function autorDoHistorico(
  createdBy: string | null,
  descricao: string | null,
  nomes: Map<string, string>,
): string {
  if (createdBy?.startsWith('portal-cliente:')) return 'Cliente (portal)';
  if (createdBy) return nomes.get(createdBy) ?? 'Usuário removido';
  if (descricao?.includes('(pelo link')) return 'Cliente (link)';
  return 'Atendimento automático';
}

/**
 * Histórico completo do orçamento — tudo o que aconteceu com ele, em ordem:
 * cadastro, alterações (com os campos), PDF, envio, link, decisão do cliente,
 * autorização de desconto e retornos agendados. Mostrado na aba Histórico do
 * formulário, acima da linha do tempo do cliente.
 */
export async function historicoOrcamento(
  tx: TenantTx,
  empresaId: string,
  orcamentoId: string,
) {
  const atividades = await tx.atividade.findMany({
    where: { empresaId, orcamentoId, deletedAt: null },
    select: {
      id: true,
      titulo: true,
      descricao: true,
      createdAt: true,
      createdBy: true,
      concluida: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const nomes = await nomesDosAutores(tx, atividades);
  return atividades.map((a) => ({
    id: a.id,
    titulo: a.titulo,
    detalhe: a.descricao,
    em: a.createdAt,
    por: autorDoHistorico(a.createdBy, a.descricao, nomes),
    pendente: !a.concluida,
  }));
}

/**
 * A mesma regra de `orcamentoExigeAutorizacao`, em lote e no banco: ids dos
 * orçamentos com algum item no máximo da regra ou acima. Serve à listagem
 * (etiqueta e filtro "Desconto"), onde testar um a um não escala.
 *
 * Só orçamentos em aberto (rascunho/enviado): aprovado já passou pela trava e
 * vencido/recusado não vão a lugar nenhum. `ids` restringe a uma página.
 */
export async function orcamentosQueExigemAutorizacao(
  tx: TenantTx,
  empresaId: string,
  ids?: string[],
): Promise<Set<string>> {
  if (ids && ids.length === 0) return new Set();
  const linhas = await tx.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT o."id"
    FROM "orcamentos" o
    JOIN "orcamento_itens" i ON i."orcamentoId" = o."id"
    JOIN "regras_desconto" r ON r."id" = i."regraDescontoId"
    WHERE o."empresaId" = ${empresaId}
      AND o."deletedAt" IS NULL
      AND o."status" IN ('rascunho', 'enviado')
      AND i."percDesconto" > 0
      AND i."percDesconto" >= r."percDescontoMaximo"
      ${ids ? Prisma.sql`AND o."id" IN (${Prisma.join(ids)})` : Prisma.empty}
  `;
  return new Set(linhas.map((l) => l.id));
}

import type { NotificacaoTipo } from '@prisma/client';
import type { TenantTx } from '../../common/prisma/prisma.service';

/**
 * Grava uma notificação para o sino de um usuário.
 *
 * É função, e não um método de service, pelo mesmo motivo de
 * `registrarAtividadeOrcamento`: ela roda **dentro da transação de quem
 * provoca o fato**. A mensagem gravada e o aviso dela nascem juntos, ou nenhum
 * dos dois — e quem produz o evento não precisa injetar mais um service.
 */
export interface NotificacaoParaRegistrar {
  empresaId: string;
  /** Destinatário. Ver `usuarioDoVendedor`. */
  usuarioId: string;
  tipo: NotificacaoTipo;
  titulo: string;
  descricao?: string | null;
  rota?: string | null;
  /**
   * Entidade que originou. Com ela, o fato repetido atualiza a notificação
   * pendente em vez de criar outra; sem ela, cada chamada é uma linha nova.
   */
  referenciaId?: string | null;
  /** Quando o fato aconteceu. Padrão: agora. */
  ocorridaEm?: Date;
  /**
   * `true` para fato que se repete e se soma (mensagem nova na mesma
   * conversa): o contador sobe e a notificação volta ao topo do feed.
   * `false` para fato único que só é reafirmado (atividade continua vencida):
   * a linha pendente fica como está.
   */
  acumular?: boolean;
  /**
   * Quem provocou. Se for o próprio destinatário, nada é gravado: ninguém
   * precisa ser avisado do que acabou de fazer.
   */
  autorUsuarioId?: string | null;
}

export async function registrarNotificacao(
  tx: TenantTx,
  n: NotificacaoParaRegistrar,
) {
  if (n.autorUsuarioId && n.autorUsuarioId === n.usuarioId) return;

  const ocorridaEm = n.ocorridaEm ?? new Date();
  const acumular = n.acumular ?? false;

  // `INSERT ... ON CONFLICT` em vez de "procura e então grava": duas mensagens
  // da mesma conversa chegando juntas passariam as duas pela busca e a segunda
  // esbarraria no índice único — dentro de uma transação, esse erro não se
  // recupera, e derrubaria a gravação da mensagem junto.
  //
  // O `WHERE` repete o predicado do índice parcial
  // (`notificacoes_pendente_por_referencia`): é assim que o Postgres sabe qual
  // índice arbitra o conflito. Linha com `referenciaId` nulo não está no
  // índice e portanto nunca conflita — sempre insere.
  await tx.$executeRaw`
    INSERT INTO "notificacoes" (
      "id", "empresaId", "usuarioId", "tipo", "titulo", "descricao", "rota",
      "referenciaId", "contador", "ocorridaEm", "criadaEm", "atualizadaEm"
    )
    VALUES (
      gen_random_uuid(), ${n.empresaId}, ${n.usuarioId},
      ${n.tipo}::"NotificacaoTipo", ${n.titulo}, ${n.descricao ?? null},
      ${n.rota ?? null}, ${n.referenciaId ?? null}, 1, ${ocorridaEm},
      NOW(), NOW()
    )
    ON CONFLICT ("empresaId", "usuarioId", "tipo", "referenciaId")
      WHERE "lidaEm" IS NULL AND "referenciaId" IS NOT NULL
    DO UPDATE SET
      "contador" = CASE WHEN ${acumular}
        THEN "notificacoes"."contador" + 1
        ELSE "notificacoes"."contador" END,
      "titulo" = EXCLUDED."titulo",
      "descricao" = EXCLUDED."descricao",
      "rota" = EXCLUDED."rota",
      "ocorridaEm" = CASE WHEN ${acumular}
        THEN EXCLUDED."ocorridaEm"
        ELSE "notificacoes"."ocorridaEm" END,
      "atualizadaEm" = NOW()
  `;
}

/**
 * Marca como lidas as notificações pendentes de uma origem.
 *
 * É a contrapartida da tabela ser fonte única: o fato deixou de valer (a
 * conversa foi aberta, a atividade foi concluída) e o sino precisa parar de
 * insistir. Sem isto, a notificação só sairia se o usuário clicasse nela.
 */
export async function marcarNotificacoesDaOrigem(
  tx: TenantTx,
  params: {
    empresaId: string;
    tipos: NotificacaoTipo[];
    referenciaId: string;
    /** Restringe a um destinatário; sem ele, marca a de todos. */
    usuarioId?: string;
  },
) {
  await tx.notificacao.updateMany({
    where: {
      empresaId: params.empresaId,
      tipo: { in: params.tipos },
      referenciaId: params.referenciaId,
      lidaEm: null,
      ...(params.usuarioId ? { usuarioId: params.usuarioId } : {}),
    },
    data: { lidaEm: new Date() },
  });
}

/**
 * Usuário por trás de um vendedor — o destinatário de tudo que é da carteira.
 *
 * Devolve `null` quando o vendedor não tem login vinculado (cadastro de
 * sistema, vendedor do ERP sem usuário): nesse caso não há quem notificar, e
 * quem chama simplesmente não registra.
 */
export async function usuarioDoVendedor(
  tx: TenantTx,
  empresaId: string,
  vendedorId: string | null | undefined,
) {
  if (!vendedorId) return null;
  const vendedor = await tx.vendedor.findFirst({
    where: { id: vendedorId, empresaId, deletedAt: null },
    select: { usuarioId: true },
  });
  return vendedor?.usuarioId ?? null;
}

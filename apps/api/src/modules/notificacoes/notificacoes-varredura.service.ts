import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { whereEmpresaAcessivel } from '../../common/empresa/situacao-empresa';
import type { NotificacaoTipo } from '@prisma/client';
import { registrarNotificacao } from './registrar-notificacao';

/**
 * De quanto em quanto tempo a varredura roda.
 *
 * Trinta minutos, e não uma vez por dia: um prazo que vence às 8h precisa
 * aparecer no sino de manhã, não na madrugada seguinte. A repetição é barata
 * porque a notificação pendente já existente não vira linha nova — o índice
 * parcial único absorve a passagem (ver `registrarNotificacao`).
 */
const INTERVALO_MS = 30 * 60_000;

/** Quantos itens de cada tipo uma passagem processa por empresa. */
const LOTE = 200;

/** O valor como o vendedor lê: R$ 1.234,56. */
function valorEmReais(valor: number) {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Vencimento não é evento: ninguém "faz" uma atividade vencer.
 *
 * Todo o resto do sino é gravado por quem provoca o fato, dentro da transação
 * dele. Prazo que estoura não tem esse alguém — é a passagem do tempo — então
 * precisa desta varredura. É a única parte do desenho que pergunta ao banco em
 * vez de ser avisada.
 */
@Injectable()
export class NotificacoesVarreduraService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificacoesVarreduraService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Uma passagem no boot: subir a API depois de uma parada longa não pode
    // esperar meia hora para mostrar o que já venceu.
    void this.varrer();
    // `unref` para o timer não segurar o processo no encerramento.
    this.timer = setInterval(() => void this.varrer(), INTERVALO_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async varrer() {
    try {
      // Empresa por empresa porque as tabelas têm RLS: sem `withTenant` a
      // consulta volta vazia. `empresas` não tem RLS, e é por ela que começa.
      const empresas = await this.prisma.empresa.findMany({
        where: { deletedAt: null, ...whereEmpresaAcessivel() },
        select: { id: true },
      });
      for (const { id } of empresas) {
        await this.atividadesVencidas(id);
        await this.titulosVencidos(id);
      }
    } catch (erro) {
      this.logger.error(`Falha na varredura de notificações: ${erro}`);
    }
  }

  /**
   * O que já foi avisado deste tipo — **lido ou não**.
   *
   * Duas razões, e as duas doem quando faltam:
   *
   * - Sem isto a janela de `LOTE` nunca anda: a consulta traz sempre os mesmos
   *   vencidos mais antigos e o que está atrás deles jamais notifica.
   * - Contar só os pendentes faria a varredura **ressuscitar** o que o usuário
   *   acabou de limpar: o título continua vencido, então meia hora depois o
   *   sino estaria cheio de novo. Prazo vencido avisa uma vez; insistir é
   *   trabalho do relatório de cobrança, não do sino.
   */
  private async jaAvisados(
    tx: TenantTx,
    empresaId: string,
    tipo: NotificacaoTipo,
  ) {
    const linhas = await tx.notificacao.findMany({
      where: { empresaId, tipo, referenciaId: { not: null } },
      select: { referenciaId: true },
    });
    return linhas.map((l) => l.referenciaId!).filter(Boolean);
  }

  /**
   * Atividade em aberto que já venceu ou vence hoje.
   *
   * O corte é o fim do dia de hoje: o que vence depois não é notificação, é
   * agenda, e tem tela própria.
   */
  private async atividadesVencidas(empresaId: string) {
    const fimDeHoje = new Date();
    fimDeHoje.setHours(23, 59, 59, 999);

    await this.prisma.withTenant(empresaId, async (tx) => {
      const avisadas = await this.jaAvisados(
        tx,
        empresaId,
        'atividade_vencimento',
      );
      const atividades = await tx.atividade.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          concluida: false,
          dataVencimento: { not: null, lte: fimDeHoje },
          id: { notIn: avisadas },
          // Vendedor sem login não tem a quem notificar. O filtro é da
          // consulta, e não um `continue` no laço: senão a janela de `LOTE`
          // se enche de quem não vira aviso e o resto nunca aparece.
          vendedor: { usuarioId: { not: null } },
        },
        select: {
          id: true,
          titulo: true,
          dataVencimento: true,
          vendedor: { select: { usuarioId: true } },
          cliente: { select: { razaoSocial: true } },
        },
        orderBy: { dataVencimento: 'asc' },
        take: LOTE,
      });

      for (const atividade of atividades) {
        await registrarNotificacao(tx, {
          empresaId,
          usuarioId: atividade.vendedor.usuarioId!,
          tipo: 'atividade_vencimento',
          titulo: atividade.titulo,
          descricao: atividade.cliente?.razaoSocial ?? null,
          rota: `/crm/atividades/${atividade.id}`,
          referenciaId: atividade.id,
          // A data do prazo, não a da varredura: é o que ordena o feed pelo
          // que está atrasado há mais tempo.
          ocorridaEm: atividade.dataVencimento ?? new Date(),
        });
      }

      // A concluída para de avisar. Sem isto, quem resolveu a tarefa
      // continuaria com a linha no sino até clicar nela.
      await tx.$executeRaw`
        UPDATE "notificacoes" n SET "lidaEm" = NOW()
        FROM "atividades" a
        WHERE n."referenciaId" = a."id"
          AND n."empresaId" = ${empresaId}
          AND n."tipo" = 'atividade_vencimento'
          AND n."lidaEm" IS NULL
          AND (a."concluida" = true OR a."ativo" = false OR a."deletedAt" IS NOT NULL)
      `;
    });
  }

  /**
   * Títulos vencidos: **uma linha por cliente**, não por título.
   *
   * Um cliente com doze parcelas atrasadas enchia o sino sozinho e empurrava
   * todo o resto para fora das vinte linhas do feed. O que o vendedor precisa
   * saber é *quem* está devendo; parcela a parcela é a tela de posição do
   * cliente, que é para onde a linha leva.
   *
   * Critério do que é vencido: o mesmo da cor de cobrança da lista de
   * conversas — em aberto (`dtBaixa` nula) e vencimento no passado.
   *
   * **Só vendedor recebe.** Supervisor e gerente também têm cadastro em
   * `vendedores` e podem ter título creditado a eles, mas cobrança de carteira
   * é do vendedor; o acompanhamento da equipe tem tela própria. Cadastro de
   * sistema (ESCRITORIO, E-COMMERCE) fica de fora pelo mesmo motivo do
   * `usuarioId` nulo: não há pessoa para avisar.
   */
  private async titulosVencidos(empresaId: string) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    await this.prisma.withTenant(empresaId, async (tx) => {
      // Agregação no banco, e não `findMany` + soma em memória: o `LOTE` aqui
      // precisa limitar **clientes**, não títulos. Contando títulos, um único
      // cliente com centenas de parcelas consumiria a janela inteira e os
      // outros nunca apareceriam.
      const grupos = await tx.$queryRaw<
        Array<{
          clienteId: string;
          usuarioId: string;
          razaoSocial: string | null;
          quantidade: number;
          total: number;
          maisAntigo: Date;
          novidadeEm: Date;
        }>
      >`
        SELECT
          t."clienteId"                                AS "clienteId",
          v."usuarioId"                                AS "usuarioId",
          c."razaoSocial"                              AS "razaoSocial",
          COUNT(*)::int                                AS "quantidade",
          SUM(t."valor")::float8                       AS "total",
          MIN(t."vencimento")                          AS "maisAntigo",
          MAX(GREATEST(t."vencimento", t."createdAt")) AS "novidadeEm"
        FROM "titulos_receber" t
        JOIN "vendedores" v
          ON v."id" = t."vendedorId" AND v."empresaId" = t."empresaId"
        LEFT JOIN "clientes" c
          ON c."id" = t."clienteId" AND c."empresaId" = t."empresaId"
        WHERE t."empresaId" = ${empresaId}
          AND t."deletedAt" IS NULL
          AND t."ativo" = true
          AND t."dtBaixa" IS NULL
          AND t."vencimento" IS NOT NULL
          AND t."vencimento" < ${hoje}
          AND t."clienteId" IS NOT NULL
          AND v."usuarioId" IS NOT NULL
          AND v."tipo" = 'vendedor'
          AND v."ativo" = true
          AND v."desligado" = false
          AND v."deletedAt" IS NULL
        GROUP BY t."clienteId", v."usuarioId", c."razaoSocial"
        ORDER BY MIN(t."vencimento") ASC
        LIMIT ${LOTE}
      `;

      // O que já foi avisado de cada cliente. Diferente do `jaAvisados` dos
      // outros tipos, que só pergunta "existe?": aqui a linha pendente **deve**
      // ser reprocessada, porque é assim que a contagem e o total acompanham a
      // parcela que venceu depois (o `ON CONFLICT` de `registrarNotificacao`
      // reescreve título e descrição da pendente).
      const historico = await tx.$queryRaw<
        Array<{
          referenciaId: string;
          usuarioId: string;
          pendente: boolean;
          ultimaLeitura: Date | null;
        }>
      >`
        SELECT
          "referenciaId"            AS "referenciaId",
          "usuarioId"               AS "usuarioId",
          bool_or("lidaEm" IS NULL) AS "pendente",
          MAX("lidaEm")             AS "ultimaLeitura"
        FROM "notificacoes"
        WHERE "empresaId" = ${empresaId}
          AND "tipo" = 'titulo_vencido'
          AND "referenciaId" IS NOT NULL
        GROUP BY "referenciaId", "usuarioId"
      `;
      const porCliente = new Map(
        historico.map((h) => [`${h.usuarioId}:${h.referenciaId}`, h]),
      );

      for (const grupo of grupos) {
        const visto = porCliente.get(`${grupo.usuarioId}:${grupo.clienteId}`);
        // Já leu e nada venceu (nem entrou) depois: não insiste. Prazo vencido
        // avisa uma vez — repetir a cada meia hora é trabalho do relatório de
        // cobrança, não do sino. O `novidadeEm` é o maior entre vencimento e
        // criação do título justamente porque o import do ERP traz parcela já
        // vencida: pelo vencimento ela seria velha e nunca avisaria.
        if (
          visto &&
          !visto.pendente &&
          visto.ultimaLeitura &&
          visto.ultimaLeitura >= grupo.novidadeEm
        ) {
          continue;
        }

        const quantos =
          grupo.quantidade === 1
            ? '1 título vencido'
            : `${grupo.quantidade} títulos vencidos`;

        await registrarNotificacao(tx, {
          empresaId,
          usuarioId: grupo.usuarioId,
          tipo: 'titulo_vencido',
          titulo: grupo.razaoSocial ?? 'Cliente sem cadastro',
          descricao: `${quantos} · ${valorEmReais(grupo.total)}`,
          rota: `/comercial/posicao-cliente/${grupo.clienteId}`,
          // O cliente é a origem, não o título: é o que faz a parcela seguinte
          // somar na linha existente em vez de abrir outra.
          referenciaId: grupo.clienteId,
          // O vencimento mais antigo, e não o da varredura: ordena o feed por
          // quem está atrasado há mais tempo.
          ocorridaEm: grupo.maisAntigo,
        });
      }

      // Cliente que não tem mais nenhum título vencido em aberto para de
      // avisar — pagou, ou o título saiu da carteira deste vendedor.
      //
      // Este UPDATE também é o que aposenta as notificações do desenho antigo,
      // uma por título: o `referenciaId` delas é um id de título, que nunca
      // casa com `clienteId`, então o `NOT EXISTS` é verdadeiro e a linha sai.
      await tx.$executeRaw`
        UPDATE "notificacoes" n SET "lidaEm" = NOW()
        WHERE n."empresaId" = ${empresaId}
          AND n."tipo" = 'titulo_vencido'
          AND n."lidaEm" IS NULL
          AND n."referenciaId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM "titulos_receber" t
            JOIN "vendedores" v ON v."id" = t."vendedorId"
            WHERE t."empresaId" = n."empresaId"
              AND t."clienteId" = n."referenciaId"
              AND v."usuarioId" = n."usuarioId"
              AND t."deletedAt" IS NULL
              AND t."ativo" = true
              AND t."dtBaixa" IS NULL
              AND t."vencimento" IS NOT NULL
              AND t."vencimento" < ${hoje}
          )
      `;
    });
  }
}

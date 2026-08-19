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
        where: { deletedAt: null, ativo: true },
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
   * Título vencido de cliente da carteira.
   *
   * Mesmo critério da cor de cobrança da lista de conversas: em aberto
   * (`dtBaixa` nula) e vencimento no passado.
   */
  private async titulosVencidos(empresaId: string) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    await this.prisma.withTenant(empresaId, async (tx) => {
      const avisados = await this.jaAvisados(tx, empresaId, 'titulo_vencido');
      const titulos = await tx.tituloReceber.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          dtBaixa: null,
          vencimento: { not: null, lt: hoje },
          id: { notIn: avisados },
          vendedor: { usuarioId: { not: null } },
        },
        select: {
          id: true,
          numero: true,
          parcela: true,
          valor: true,
          vencimento: true,
          clienteId: true,
          vendedor: { select: { usuarioId: true } },
          cliente: { select: { razaoSocial: true } },
        },
        orderBy: { vencimento: 'asc' },
        take: LOTE,
      });

      for (const titulo of titulos) {
        const numero = titulo.parcela
          ? `${titulo.numero}/${titulo.parcela}`
          : titulo.numero;
        await registrarNotificacao(tx, {
          empresaId,
          usuarioId: titulo.vendedor!.usuarioId!,
          tipo: 'titulo_vencido',
          titulo: `Título ${numero} vencido — ${titulo.cliente?.razaoSocial ?? 'cliente sem cadastro'}`,
          descricao: valorEmReais(titulo.valor),
          rota: titulo.clienteId
            ? `/comercial/posicao-cliente/${titulo.clienteId}`
            : '/comercial/titulos-receber',
          referenciaId: titulo.id,
          ocorridaEm: titulo.vencimento ?? new Date(),
        });
      }

      // Baixado (pago) para de avisar.
      await tx.$executeRaw`
        UPDATE "notificacoes" n SET "lidaEm" = NOW()
        FROM "titulos_receber" t
        WHERE n."referenciaId" = t."id"
          AND n."empresaId" = ${empresaId}
          AND n."tipo" = 'titulo_vencido'
          AND n."lidaEm" IS NULL
          AND (t."dtBaixa" IS NOT NULL OR t."ativo" = false OR t."deletedAt" IS NOT NULL)
      `;
    });
  }
}

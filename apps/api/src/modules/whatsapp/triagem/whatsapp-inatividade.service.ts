import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { whereEmpresaAcessivel } from '../../../common/empresa/situacao-empresa';

/**
 * De quanto em quanto tempo a varredura passa.
 *
 * Cinco minutos, e não trinta como a do sino: o prazo configurado pela empresa
 * costuma ser curto (30 min é o padrão), e varrer de meia em meia hora faria o
 * encerramento demorar até o dobro do que o administrador escolheu.
 */
const INTERVALO_MS = 5 * 60_000;

/** Quantas conversas uma passagem encerra por empresa. */
const LOTE = 500;

/**
 * Encerra a conversa que parou no meio da triagem.
 *
 * Conversa em `bot` não está com a IA nem com uma pessoa: ela não aparece em
 * fila nenhuma, não tem dono e não conta como espera. Se o cliente some no
 * meio — o que é o desfecho mais comum de um "oi" sem sequência — ela fica ali
 * para sempre, invisível para todos.
 *
 * Encerrar não perde nada: mensagem nova do cliente devolve a conversa para
 * `bot` e a triagem recomeça do zero, saudação inclusive (ver o `reabriu` em
 * `WhatsappConversasService`). O que o encerramento faz é tirar do limbo o que
 * já acabou.
 */
@Injectable()
export class WhatsappInatividadeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WhatsappInatividadeService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.varrer();
    // `unref` para o timer não segurar o processo no encerramento.
    this.timer = setInterval(() => void this.varrer(), INTERVALO_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async varrer() {
    try {
      // Empresa por empresa porque as tabelas de WhatsApp têm RLS: sem
      // `withTenant` a consulta volta vazia. `empresas` não tem RLS.
      const empresas = await this.prisma.empresa.findMany({
        where: { deletedAt: null, ...whereEmpresaAcessivel() },
        select: { id: true },
      });
      for (const { id } of empresas) {
        await this.encerrarParadas(id);
      }
    } catch (erro) {
      this.logger.error(
        `Falha na varredura de inatividade da triagem: ${erro}`,
      );
    }
  }

  private async encerrarParadas(empresaId: string) {
    const config = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappConfig.findUnique({
        where: { empresaId },
        select: { atendimentoInatividadeMin: true, atendimentoIaAtivo: true },
      }),
    );

    // 0 desliga o encerramento. Com a triagem desligada também não há o que
    // encerrar: a conversa nem chega a ficar em `bot` (ver `paraFila`).
    const minutos = config?.atendimentoInatividadeMin ?? 0;
    if (!config?.atendimentoIaAtivo || minutos <= 0) return;

    const corte = new Date(Date.now() - minutos * 60_000);

    await this.prisma.withTenant(empresaId, async (tx) => {
      const paradas = await tx.whatsappConversa.findMany({
        where: {
          empresaId,
          atendimento: 'bot',
          // Nunca encerra conversa sem mensagem: `ultimaMensagemEm` nulo é
          // conversa recém-criada, e o corte a pegaria antes de o cliente
          // chegar a escrever.
          ultimaMensagemEm: { not: null, lt: corte },
          // Só o número institucional passa por triagem.
          sessao: { tipo: 'empresa' },
        },
        take: LOTE,
        select: { id: true },
      });
      if (paradas.length === 0) return;

      await tx.whatsappConversa.updateMany({
        where: { id: { in: paradas.map((p) => p.id) } },
        data: {
          atendimento: 'encerrada',
          assunto: 'Encerrada por inatividade',
          // Zera a saudação: o cliente que voltar depois é assunto novo, e
          // começa sendo cumprimentado como qualquer um.
          saudadoEm: null,
        },
      });

      this.logger.log(
        `Triagem: ${paradas.length} conversa(s) encerrada(s) por ${minutos} min de silêncio (empresa ${empresaId})`,
      );
    });
  }
}

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { INTEGRACAO_LOTE_MAX } from '@plataforma/contracts';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { aplicarBloco } from './aplicar-bloco';
import { EntidadesCarga } from './entidades-carga';
import { IntegracaoCargasService } from './integracao-cargas.service';
import { blocosDoArquivo, descompactar } from './ler-arquivo-carga';

/** De quanto em quanto tempo a varredura procura carga para processar. */
const INTERVALO_MS = 15_000;

/**
 * Carga em `processando` sem avanço há mais que isto foi largada — a API
 * caiu ou foi reiniciada no meio. Um bloco leva segundos (1.000 registros a
 * ~7 ms), então dez minutos parado não é lentidão.
 */
const PARADA_MS = 10 * 60_000;

/** Quantas vezes uma carga pode ser pega antes de parar em `erro`. */
const MAX_TENTATIVAS = 5;

/**
 * Processa as cargas por arquivo em segundo plano.
 *
 * **Uma carga por vez por empresa, na ordem de chegada.** É o que preserva a
 * dependência entre entidades: o ERP sobe na ordem do catálogo, e a carga de
 * títulos só começa quando a de vendedores e clientes terminou. Empresas
 * diferentes andam em paralelo — a carga de uma não espera a da outra.
 *
 * **Retomável.** Depois de cada bloco a carga grava a última linha aplicada
 * (`ultimaLinha`). Se a API cair no meio, a próxima varredura retoma dali;
 * reaplicar o bloco interrompido não duplica nada, o upsert é por chave.
 *
 * Percorre empresa por empresa porque as tabelas têm RLS (mesmo molde do
 * `WhatsappAgendamentoService`); `empresas` não tem, e é por ela que começa.
 */
@Injectable()
export class CargasProcessador implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CargasProcessador.name);
  private timer: NodeJS.Timeout | null = null;
  private varrendo = false;
  /** Empresas com carga rodando neste processo. */
  private readonly emAndamento = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly entidades: EntidadesCarga,
    private readonly cargas: IntegracaoCargasService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.varrer(), INTERVALO_MS);
    // `unref` para o timer não segurar o processo no encerramento.
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async varrer() {
    if (this.varrendo) return;
    this.varrendo = true;
    try {
      const empresas = await this.prisma.empresa.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      for (const { id } of empresas) {
        if (this.emAndamento.has(id)) continue;
        const cargaId = await this.reservar(id);
        if (!cargaId) continue;

        // Não espera: a carga de uma empresa pode levar minutos, e a varredura
        // segue para as outras.
        this.emAndamento.add(id);
        void this.processar(id, cargaId).finally(() =>
          this.emAndamento.delete(id),
        );
      }
    } catch (erro) {
      this.logger.error(
        `Falha na varredura de cargas por arquivo: ${String(erro)}`,
      );
    } finally {
      this.varrendo = false;
    }
  }

  /**
   * A próxima carga da empresa, já marcada como sua. A troca de situação por
   * `updateMany` condicional é a trava entre réplicas: quem muda a linha
   * (`count: 1`) processa, a outra segue adiante.
   */
  private async reservar(empresaId: string): Promise<string | null> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const proxima = await tx.integracaoCarga.findFirst({
        where: { empresaId, situacao: { in: ['recebida', 'processando'] } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          situacao: true,
          updatedAt: true,
          tentativas: true,
          iniciadaEm: true,
        },
      });
      if (!proxima) return null;

      const limite = new Date(Date.now() - PARADA_MS);
      // A mais antiga está rodando em outro lugar: as seguintes esperam por ela.
      if (proxima.situacao === 'processando' && proxima.updatedAt > limite)
        return null;

      if (proxima.tentativas >= MAX_TENTATIVAS) {
        await tx.integracaoCarga.update({
          where: { id: proxima.id },
          data: {
            situacao: 'erro',
            concluidaEm: new Date(),
            mensagem: `Interrompida ${MAX_TENTATIVAS} vezes no meio do processamento. Veja o log da API; o que já foi aplicado fica aplicado.`,
          },
        });
        return null;
      }

      const { count } = await tx.integracaoCarga.updateMany({
        where: {
          id: proxima.id,
          OR: [
            { situacao: 'recebida' },
            { situacao: 'processando', updatedAt: { lt: limite } },
          ],
        },
        data: {
          situacao: 'processando',
          tentativas: { increment: 1 },
          iniciadaEm: proxima.iniciadaEm ?? new Date(),
        },
      });
      return count === 1 ? proxima.id : null;
    });
  }

  private async processar(empresaId: string, cargaId: string) {
    try {
      const carga = await this.prisma.withTenant(empresaId, (tx) =>
        tx.integracaoCarga.findFirstOrThrow({
          where: { id: cargaId },
          select: {
            arquivo: true,
            apiKeyId: true,
            ultimaLinha: true,
            tentativas: true,
          },
        }),
      );

      if (carga.tentativas > 1) {
        this.logger.warn(
          `Carga ${cargaId} retomada depois da linha ${carga.ultimaLinha}.`,
        );
      }

      const texto = descompactar(Buffer.from(carga.arquivo));

      for (const bloco of blocosDoArquivo(
        texto,
        carga.ultimaLinha,
        INTEGRACAO_LOTE_MAX,
      )) {
        try {
          await this.cargas.conferirEndpointsAtivos(empresaId, [
            bloco.entidade,
          ]);
        } catch (erro) {
          await this.encerrar(
            empresaId,
            cargaId,
            'erro',
            (erro as Error).message,
          );
          return;
        }

        const resultado = await aplicarBloco(
          this.entidades.de(bloco.entidade),
          empresaId,
          carga.apiKeyId,
          bloco.linhas,
        );

        // Erros e checkpoint na mesma transação: retomar depois de uma queda
        // entre os dois gravaria os erros do bloco duas vezes.
        const cancelar = await this.prisma.withTenant(empresaId, async (tx) => {
          if (resultado.erros.length > 0) {
            await tx.integracaoCargaErro.createMany({
              data: resultado.erros.map((e) => ({
                empresaId,
                cargaId,
                linha: e.linha,
                entidade: bloco.entidade,
                chave: e.chave?.slice(0, 200) ?? null,
                mensagem: e.mensagem,
              })),
            });
          }
          const atual = await tx.integracaoCarga.update({
            where: { id: cargaId },
            data: {
              ultimaLinha: bloco.ultimaLinha,
              linhasProcessadas: { increment: bloco.linhas.length },
              criados: { increment: resultado.criados },
              atualizados: { increment: resultado.atualizados },
              excluidos: { increment: resultado.excluidos },
              erros: { increment: resultado.erros.length },
            },
            select: { cancelarSolicitado: true },
          });
          return atual.cancelarSolicitado;
        });

        if (cancelar) {
          await this.encerrar(
            empresaId,
            cargaId,
            'cancelada',
            `Cancelada depois da linha ${bloco.ultimaLinha}. O que veio antes já foi aplicado.`,
          );
          return;
        }
      }

      await this.encerrar(empresaId, cargaId, 'concluida', null);
    } catch (erro) {
      // Falha fora do registro (banco fora, arquivo ilegível): a carga fica em
      // `processando` e a varredura a retoma quando o batimento envelhecer,
      // até o teto de tentativas.
      this.logger.error(`Carga ${cargaId} interrompida: ${String(erro)}`);
      await this.prisma
        .withTenant(empresaId, (tx) =>
          tx.integracaoCarga.update({
            where: { id: cargaId },
            data: {
              mensagem: `Interrompida, será retomada: ${String(erro).slice(0, 500)}`,
            },
          }),
        )
        .catch(() => undefined);
    }
  }

  private async encerrar(
    empresaId: string,
    cargaId: string,
    situacao: 'concluida' | 'cancelada' | 'erro',
    mensagem: string | null,
  ) {
    await this.prisma.withTenant(empresaId, (tx) =>
      tx.integracaoCarga.update({
        where: { id: cargaId },
        data: { situacao, mensagem, concluidaEm: new Date() },
      }),
    );
  }
}

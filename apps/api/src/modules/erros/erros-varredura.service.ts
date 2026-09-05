import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ErrosLogService } from './erros-log.service';

/**
 * De quanto em quanto tempo o expurgo roda. Meia hora, igual à varredura do
 * sino — não há pressa: o que segura a rajada no curto prazo é a janela de
 * colapso do `ErrosLogService`, não esta passagem.
 */
const INTERVALO_MS = 30 * 60_000;

/** Quantas linhas uma passagem apaga por vez, por empresa. */
const LOTE = 5_000;

/**
 * Retenção do log de erros: prazo em dias e teto por empresa.
 *
 * Os dois existem porque cada um cobre o que o outro não cobre. O prazo
 * sozinho não segura um bug em laço, que enche a tabela **dentro** da janela;
 * o teto sozinho deixa erro antigo ocupando espaço para sempre numa empresa
 * quieta.
 */
@Injectable()
export class ErrosVarreduraService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ErrosVarreduraService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly errosLog: ErrosLogService,
  ) {}

  onModuleInit() {
    // Uma passagem no boot: subir depois de uma parada longa não deveria
    // esperar meia hora para devolver o espaço.
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
      const config = await this.errosLog.lerConfig();
      await this.expurgarPorPrazo(config.retencaoDias);
      await this.aplicarTeto(config.tetoPorEmpresa);
    } catch (erro) {
      // Não passa pelo filtro de exceção: um erro aqui viraria linha no
      // próprio log que a varredura está tentando limpar.
      this.logger.error(`Falha na varredura do log de erros: ${erro}`);
    }
  }

  /** 0 = sem expurgo por tempo (a decisão de guardar para sempre é válida). */
  private async expurgarPorPrazo(retencaoDias: number) {
    if (retencaoDias <= 0) return;
    const corte = new Date(Date.now() - retencaoDias * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.erroLog.deleteMany({
      where: { ultimaEm: { lt: corte } },
    });
    if (count > 0) {
      this.logger.log(
        `Expurgo do log de erros: ${count} linha(s) anteriores a ${corte.toISOString()}`,
      );
    }
  }

  /**
   * Teto por empresa: passando do limite, as **mais antigas** saem.
   *
   * Cortar as mais recentes seria o contrário do que se quer — o incidente em
   * curso é justamente o que alguém está tentando olhar.
   */
  private async aplicarTeto(teto: number) {
    if (teto <= 0) return;

    const porEmpresa = await this.prisma.erroLog.groupBy({
      by: ['empresaId'],
      _count: { _all: true },
    });

    for (const grupo of porEmpresa) {
      const excedente = grupo._count._all - teto;
      if (excedente <= 0) continue;

      // `empresaId: null` é um balde legítimo: erro antes de haver empresa
      // ativa (login, refresh). Ele também respeita o teto.
      const antigas = await this.prisma.erroLog.findMany({
        where: { empresaId: grupo.empresaId },
        orderBy: { ultimaEm: 'asc' },
        take: Math.min(excedente, LOTE),
        select: { id: true },
      });

      const { count } = await this.prisma.erroLog.deleteMany({
        where: { id: { in: antigas.map((a) => a.id) } },
      });
      this.logger.log(
        `Teto do log de erros (${teto}) aplicado à empresa ` +
          `${grupo.empresaId ?? 'sem empresa'}: ${count} linha(s) removida(s)`,
      );
    }
  }
}

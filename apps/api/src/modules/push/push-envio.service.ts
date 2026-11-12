import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { NotificacaoTipo } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { whereEmpresaAcessivel } from '../../common/empresa/situacao-empresa';
import { HorarioTrabalhoService } from '../acessos/horario-trabalho.service';
import { PushService } from './push.service';
import { TITULO_PUSH, rotaSegura } from './push-texto';

/** De quanto em quanto tempo a fila é lida. */
const INTERVALO_MS = 20_000;
/** Linhas por empresa a cada passagem. */
const LOTE = 200;
/**
 * Aviso mais velho que isto não vai mais para o celular: chegaria fora de
 * hora (API parada, chaves configuradas depois). Continua no sino.
 */
const VALIDADE_MS = 15 * 60_000;

interface LinhaFila {
  id: string;
  usuarioId: string;
  tipo: NotificacaoTipo;
  rota: string | null;
  referenciaId: string | null;
  criadaEm: Date;
}

/**
 * Leva ao celular o que foi gravado no sino.
 *
 * Fila de saída, e não envio na hora: `registrarNotificacao` roda dentro da
 * transação de quem provoca o fato, e um aviso mandado de lá sairia mesmo que
 * a transação fosse desfeita — além de pendurar uma chamada externa no meio
 * dela. Aqui só se lê o que já foi confirmado no banco.
 *
 * Cada linha é tratada uma vez (`pushEm`), enviada ou descartada: sem aparelho
 * apto, fora do expediente, tipo que não vai para o celular ou velha demais.
 * Acesso é decidido na origem — o aviso vai só para o destinatário que a
 * notificação já tinha; o envio não amplia quem fica sabendo de quê.
 */
@Injectable()
export class PushEnvioService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushEnvioService.name);
  private timer: NodeJS.Timeout | null = null;
  private rodando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly horarios: HorarioTrabalhoService,
  ) {}

  onModuleInit() {
    if (!this.push.configurado) {
      this.logger.log('Chaves VAPID ausentes: aviso no celular desligado.');
      return;
    }
    this.timer = setInterval(() => void this.passar(), INTERVALO_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Uma passagem pela fila. Pública para os testes. */
  async passar() {
    if (this.rodando) return;
    this.rodando = true;
    try {
      const aptos = await this.push.usuariosComAparelho();
      // Ninguém com aparelho: nada a enviar, e o que estiver na fila envelhece
      // e é descartado quando alguém ligar o aviso.
      if (aptos.size === 0) return;
      const empresas = await this.prisma.empresa.findMany({
        where: { deletedAt: null, ...whereEmpresaAcessivel() },
        select: { id: true },
      });
      for (const { id } of empresas) {
        await this.passarEmpresa(id, aptos);
      }
    } catch (erro) {
      this.logger.error(`Falha no envio de avisos ao celular: ${String(erro)}`);
    } finally {
      this.rodando = false;
    }
  }

  private async passarEmpresa(empresaId: string, aptos: Set<string>) {
    // Reivindica e marca numa instrução só: com mais de uma réplica da API,
    // `SKIP LOCKED` impede duas de mandarem o mesmo aviso.
    const linhas = await this.prisma.withTenant(
      empresaId,
      (tx) =>
        tx.$queryRaw<LinhaFila[]>`
        UPDATE "notificacoes" SET "pushEm" = NOW()
        WHERE "id" IN (
          SELECT "id" FROM "notificacoes"
          WHERE "empresaId" = ${empresaId} AND "pushEm" IS NULL
          ORDER BY "criadaEm"
          LIMIT ${LOTE}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING "id", "usuarioId", "tipo", "rota", "referenciaId", "criadaEm"
      `,
    );
    const limite = Date.now() - VALIDADE_MS;
    for (const n of linhas) {
      const titulo = TITULO_PUSH[n.tipo];
      if (!titulo || !aptos.has(n.usuarioId)) continue;
      if (n.criadaEm.getTime() < limite) continue;
      const expediente = await this.horarios.verificar(n.usuarioId, empresaId);
      if (!expediente.dentro) continue;
      await this.push.enviarParaUsuario(n.usuarioId, {
        titulo,
        corpo: 'Toque para abrir.',
        rota: rotaSegura(n.rota),
        tag: `${n.tipo}:${n.referenciaId ?? n.id}`,
      });
    }
  }
}

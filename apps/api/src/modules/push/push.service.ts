import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import type { PushAssinaturaInput, PushConfig } from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { PushPayload } from './push-texto';

/** Quanto o serviço de push guarda o aviso para aparelho desligado. */
const TTL_SEGUNDOS = 60 * 60;

/**
 * Assinaturas de notificação no celular e o envio em si.
 *
 * Sem chaves VAPID na stack o recurso fica desligado: `config()` devolve
 * `chavePublica: null`, a tela não oferece o interruptor e nada é enviado.
 * Ver `docs/runbook-operacao.md`, "Chaves do aviso no celular (VAPID)".
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly chavePublica: string | null = null;

  constructor(private readonly prisma: PrismaService) {
    const publica = process.env.VAPID_PUBLIC_KEY?.trim();
    const privada = process.env.VAPID_PRIVATE_KEY?.trim();
    const contato =
      process.env.VAPID_SUBJECT?.trim() || 'mailto:suporte@localhost';
    if (!publica || !privada) return;
    try {
      webpush.setVapidDetails(contato, publica, privada);
      this.chavePublica = publica;
    } catch (erro) {
      this.logger.error(
        `Chaves VAPID inválidas; aviso no celular desligado: ${String(erro)}`,
      );
    }
  }

  get configurado() {
    return this.chavePublica !== null;
  }

  config(): PushConfig {
    return { chavePublica: this.chavePublica };
  }

  /**
   * Grava (ou atualiza) a assinatura deste aparelho, presa à sessão atual.
   *
   * O endpoint identifica o aparelho: se ele era de outra pessoa (celular
   * compartilhado, outro login), passa a ser de quem está logado agora — o
   * anterior não pode seguir recebendo aviso num aparelho que não usa mais.
   */
  async assinar(
    user: AuthenticatedUser,
    input: PushAssinaturaInput,
    userAgent?: string | null,
  ) {
    const dados = {
      usuarioId: user.id,
      sessaoId: user.sessaoId ?? null,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: userAgent?.slice(0, 300) ?? null,
    };
    if (input.religar) {
      const religadas = await this.prisma.pushAssinatura.updateMany({
        where: { endpoint: input.endpoint, usuarioId: user.id },
        data: dados,
      });
      return { ok: religadas.count > 0 };
    }
    await this.prisma.pushAssinatura.upsert({
      where: { endpoint: input.endpoint },
      create: { endpoint: input.endpoint, ...dados },
      update: dados,
    });
    return { ok: true };
  }

  /** Desliga o aviso neste aparelho. Só a assinatura do próprio usuário. */
  async cancelar(user: AuthenticatedUser, endpoint: string) {
    await this.prisma.pushAssinatura.deleteMany({
      where: { endpoint, usuarioId: user.id },
    });
    return { ok: true };
  }

  /** Aviso de teste para os aparelhos do usuário com sessão aberta. */
  async testar(user: AuthenticatedUser) {
    const enviados = await this.enviarParaUsuario(user.id, {
      titulo: 'Aviso no celular ligado',
      corpo: 'É assim que os avisos vão chegar.',
      rota: '/perfil',
      tag: 'teste',
    });
    return { enviados };
  }

  /**
   * Usuários com ao menos um aparelho apto a receber agora: assinatura presa
   * a uma sessão que segue aberta.
   */
  async usuariosComAparelho(): Promise<Set<string>> {
    const linhas = await this.prisma.pushAssinatura.findMany({
      where: { sessao: { encerradaEm: null } },
      select: { usuarioId: true },
      distinct: ['usuarioId'],
    });
    return new Set(linhas.map((l) => l.usuarioId));
  }

  /**
   * Envia para cada aparelho apto do usuário. Assinatura que o serviço de push
   * diz não existir mais (404/410: app removido, permissão retirada) é
   * apagada. Devolve quantos envios foram aceitos.
   */
  async enviarParaUsuario(
    usuarioId: string,
    payload: PushPayload,
  ): Promise<number> {
    if (!this.configurado) return 0;
    const assinaturas = await this.prisma.pushAssinatura.findMany({
      where: { usuarioId, sessao: { encerradaEm: null } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    const corpo = JSON.stringify(payload);
    let aceitos = 0;
    await Promise.all(
      assinaturas.map(async (a) => {
        try {
          await webpush.sendNotification(
            { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
            corpo,
            { TTL: TTL_SEGUNDOS, urgency: 'normal' },
          );
          aceitos++;
          await this.prisma.pushAssinatura.update({
            where: { id: a.id },
            data: { ultimoEnvioEm: new Date() },
          });
        } catch (erro) {
          const status = (erro as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.prisma.pushAssinatura.deleteMany({
              where: { id: a.id },
            });
          } else {
            this.logger.warn(
              `Falha no envio ao celular (status ${status ?? '?'}): ${String(erro)}`,
            );
          }
        }
      }),
    );
    return aceitos;
  }
}

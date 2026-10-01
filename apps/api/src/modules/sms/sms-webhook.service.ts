import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { registrarAtividadeDocumento } from '../../common/atividades/registrar-atividade-documento';
import { normalizarCelular, segredoWebhook } from './sms.service';

/** O que a iAgente manda no webhook (GET, query string). */
export type WebhookSmsQuery = {
  codigosms?: string;
  celular?: string;
  shortcode?: string;
  status?: string;
  mensagem?: string;
  data?: string;
  canal?: string;
  statusid?: string;
};

/** "26/03/2026 14:32:10", horário de Brasília → Date. */
export function dataDoWebhook(valor: string | undefined): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(
    (valor ?? '').trim(),
  );
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Webhook da iAgente (docs/planos/2026-10-01-sms-iagente.md): status de
 * entrega e **respostas do cliente**.
 *
 * O vínculo com o envio é o `codigosms`, que traz o `client_ref` do SMS
 * original — o id do `SmsEnvio`. Resposta espontânea (palavra-chave) chega
 * sem ele; nesse caso vale o último envio para o mesmo celular, porque quem
 * responde quase sempre responde ao último SMS que recebeu.
 *
 * A iAgente repete o webhook até receber 200 (até 10 vezes): a mesma resposta
 * não vira duas linhas, e o que não se reconhece responde 200 mesmo assim —
 * senão ela insistiria à toa.
 */
@Injectable()
export class SmsWebhookService {
  private readonly logger = new Logger(SmsWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Confere o segredo da URL; errado é 404, sem dizer por quê. */
  conferirSegredo(empresaId: string, segredo: string) {
    if (!UUID.test(empresaId)) throw new NotFoundException();
    const esperado = Buffer.from(segredoWebhook(empresaId));
    const recebido = Buffer.from(segredo ?? '');
    if (
      esperado.length !== recebido.length ||
      !timingSafeEqual(esperado, recebido)
    ) {
      throw new NotFoundException();
    }
  }

  async processar(empresaId: string, segredo: string, q: WebhookSmsQuery) {
    this.conferirSegredo(empresaId, segredo);
    const status = (q.status ?? '').trim();
    const codigo = (q.codigosms ?? '').trim();

    if (status.toLowerCase() === 'resposta') {
      await this.registrarResposta(empresaId, q, codigo);
      return;
    }

    // Status de entrega do envio (Entregue, Falha operadora, Recusada...).
    if (codigo && UUID.test(codigo) && status) {
      await this.prisma.withTenant(empresaId, (tx) =>
        tx.smsEnvio.updateMany({
          where: { id: codigo, empresaId },
          data: { status, statusEm: dataDoWebhook(q.data) ?? new Date() },
        }),
      );
    }
  }

  private async registrarResposta(
    empresaId: string,
    q: WebhookSmsQuery,
    codigo: string,
  ) {
    const mensagem = (q.mensagem ?? '').trim();
    const celular =
      normalizarCelular(q.celular) ?? (q.celular ?? '').replace(/\D/g, '');
    if (!mensagem || !celular) return;
    const recebidaEm = dataDoWebhook(q.data) ?? new Date();

    await this.prisma.withTenant(empresaId, async (tx) => {
      const envio =
        (codigo && UUID.test(codigo)
          ? await tx.smsEnvio.findFirst({
              where: { id: codigo, empresaId },
              select: {
                id: true,
                clienteId: true,
                vendedorId: true,
                mensagem: true,
              },
            })
          : null) ??
        (await tx.smsEnvio.findFirst({
          where: { empresaId, celular },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            clienteId: true,
            vendedorId: true,
            mensagem: true,
          },
        }));

      // Repetição do mesmo webhook: já gravada.
      const repetida = await tx.smsResposta.findFirst({
        where: { empresaId, celular, mensagem, recebidaEm },
        select: { id: true },
      });
      if (repetida) return;

      await tx.smsResposta.create({
        data: {
          empresaId,
          smsEnvioId: envio?.id ?? null,
          clienteId: envio?.clienteId ?? null,
          celular,
          mensagem,
          recebidaEm,
        },
      });

      // Histórico de atendimento do cliente — sem autor: quem fala é ele.
      if (envio?.clienteId) {
        await registrarAtividadeDocumento(tx, {
          empresaId,
          autor: null,
          evento: 'sms_resposta',
          clienteId: envio.clienteId,
          vendedorId: envio.vendedorId,
          numero: '',
          descricao: `De ${celular}: ${mensagem} · em resposta a: ${envio.mensagem.slice(0, 120)}`,
        });
      }
    });
    this.logger.log(`Resposta por SMS recebida de ${celular}`);
  }
}

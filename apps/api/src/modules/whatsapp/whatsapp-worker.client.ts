import { BadGatewayException, Injectable, Logger } from '@nestjs/common';

/**
 * Cliente HTTP para o `apps/whatsapp-worker` — o serviço que mantém as
 * conexões de WhatsApp de pé.
 *
 * Por que um serviço à parte, e não dentro da API: cada sessão é um WebSocket
 * vivo e com estado. A API sobe e desce a cada deploy e escala em réplicas;
 * uma sessão duplicada em duas réplicas faz o WhatsApp derrubar a anterior.
 *
 * O segredo compartilhado (`WHATSAPP_WORKER_TOKEN`) existe porque o worker
 * expõe operações que falam pelo WhatsApp do vendedor — ele não pode ficar
 * aberto na rede interna sem autenticação.
 */
@Injectable()
export class WhatsappWorkerClient {
  private readonly logger = new Logger(WhatsappWorkerClient.name);

  private get timeoutMs(): number {
    const bruto = Number(process.env.WHATSAPP_WORKER_TIMEOUT_MS);
    return Number.isFinite(bruto) && bruto > 0 ? bruto : 10000;
  }

  async chamar<T>(
    workerUrl: string | null,
    caminho: string,
    opcoes: { metodo?: 'GET' | 'POST' | 'DELETE'; corpo?: unknown } = {},
  ): Promise<T> {
    if (!workerUrl) {
      // Mensagem operacional de propósito: é o administrador que resolve, e
      // ele precisa saber exatamente onde configurar.
      throw new BadGatewayException(
        'O serviço de WhatsApp não está configurado. Informe a URL do worker em ' +
          'Administração > WhatsApp.',
      );
    }

    const { metodo = 'GET', corpo } = opcoes;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `${workerUrl.replace(/\/+$/, '')}${caminho}`;

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        method: metodo,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(process.env.WHATSAPP_WORKER_TOKEN
            ? { authorization: `Bearer ${process.env.WHATSAPP_WORKER_TOKEN}` }
            : {}),
        },
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.logger.error(`worker ${metodo} ${caminho}: ${motivo}`);
      throw new BadGatewayException(
        'O serviço de WhatsApp não respondeu. Verifique se ele está no ar.',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => '');
      this.logger.error(`worker ${metodo} ${caminho}: ${resposta.status} ${texto}`);
      throw new BadGatewayException(
        `O serviço de WhatsApp recusou a operação (${resposta.status}).`,
      );
    }

    return (await resposta.json()) as T;
  }
}

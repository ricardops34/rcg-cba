import { BadGatewayException, Injectable, Logger } from '@nestjs/common';

/**
 * Cliente HTTP da WhatsApp Cloud API (Graph API da Meta).
 *
 * Bem mais simples que `EvolutionGoClient`: um cabeçalho de autenticação só
 * (`Authorization: Bearer`), um formato de erro documentado e estável
 * (`{ error: { message, code, error_subcode } }`) — não há divergência de
 * versão para tratar de forma defensiva como na Evolution GO.
 */
@Injectable()
export class CloudApiClient {
  private readonly logger = new Logger(CloudApiClient.name);

  /**
   * Versão da Graph API. Fixa por padrão; `WHATSAPP_CLOUD_API_VERSION`
   * existe para o dia em que a Meta aposentar a versão em uso sem que isso
   * precise de um deploy de código.
   */
  private get baseUrl(): string {
    const versao = process.env.WHATSAPP_CLOUD_API_VERSION || 'v21.0';
    return `https://graph.facebook.com/${versao}`;
  }

  private get timeoutMs(): number {
    const bruto = Number(process.env.WHATSAPP_CLOUD_API_TIMEOUT_MS);
    return Number.isFinite(bruto) && bruto > 0 ? bruto : 15000;
  }

  /**
   * Chamada crua à Graph API. `caminho` já inclui o id (Phone Number ID ou
   * Business Account ID) — os dois vêm da configuração da empresa, não desta
   * classe, que não conhece tenant nenhum.
   */
  async chamar<T>(
    caminho: string,
    opcoes: {
      metodo?: 'GET' | 'POST' | 'DELETE';
      corpo?: unknown;
      token: string | null;
    },
  ): Promise<T> {
    const { metodo = 'GET', corpo, token } = opcoes;
    if (!token) {
      throw new BadGatewayException(
        'A Cloud API não está configurada. Informe o token de acesso em ' +
          'Administração > WhatsApp > API Oficial.',
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `${this.baseUrl}${caminho}`;

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        method: metodo,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      // Só método e caminho: token e corpo ficam de fora do log.
      this.logger.error(`cloud-api ${metodo} ${caminho}: ${motivo}`);
      throw new BadGatewayException(
        'A WhatsApp Cloud API não respondeu. Tente novamente em instantes.',
      );
    } finally {
      clearTimeout(timer);
    }

    const corpoResposta = (await resposta.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;

    if (!resposta.ok) {
      const mensagem =
        corpoResposta?.error?.message ?? `HTTP ${resposta.status}`;
      this.logger.error(`cloud-api ${metodo} ${caminho}: ${mensagem}`);
      throw new BadGatewayException(`A Meta recusou a operação: ${mensagem}`);
    }

    return (corpoResposta ?? {}) as T;
  }

  /**
   * Upload de mídia — passo obrigatório antes de anexar um arquivo a uma
   * mensagem: a Cloud API não aceita bytes embutidos (`data:` URI) como a
   * Evolution GO aceita, só o `id` de um upload prévio.
   *
   * Multipart, e por isso separado de `chamar()`: o `content-type` com o
   * boundary precisa ser gerado pelo próprio `fetch` a partir do `FormData`,
   * nunca fixado à mão.
   */
  async enviarMedia(
    phoneNumberId: string,
    token: string | null,
    arquivo: { conteudoBase64: string; mime: string },
  ): Promise<string> {
    if (!token) {
      throw new BadGatewayException(
        'A Cloud API não está configurada. Informe o token de acesso em ' +
          'Administração > WhatsApp > API Oficial.',
      );
    }

    const bytes = Buffer.from(arquivo.conteudoBase64, 'base64');
    const form = new FormData();
    form.set('messaging_product', 'whatsapp');
    form.set('type', arquivo.mime);
    form.set('file', new Blob([bytes], { type: arquivo.mime }), 'arquivo');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let resposta: Response;
    try {
      resposta = await fetch(`${this.baseUrl}/${phoneNumberId}/media`, {
        method: 'POST',
        signal: controller.signal,
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.logger.error(`cloud-api upload media: ${motivo}`);
      throw new BadGatewayException(
        'A WhatsApp Cloud API não respondeu ao upload do arquivo.',
      );
    } finally {
      clearTimeout(timer);
    }

    const corpo = (await resposta.json().catch(() => null)) as {
      id?: string;
      error?: { message?: string };
    } | null;

    if (!resposta.ok || !corpo?.id) {
      throw new BadGatewayException(
        `A Meta recusou o upload do arquivo: ${corpo?.error?.message ?? `HTTP ${resposta.status}`}`,
      );
    }
    return corpo.id;
  }
}

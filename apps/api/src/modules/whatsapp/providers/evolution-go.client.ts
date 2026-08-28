import { BadGatewayException, Injectable, Logger } from '@nestjs/common';

/**
 * Cliente HTTP da Evolution GO.
 *
 * Duas decisões de desenho valem explicação, porque as duas parecem
 * desleixo e não são:
 *
 * **1. Autenticação por dois cabeçalhos.** A documentação da Evolution GO
 * diverge entre páginas sobre o nome do cabeçalho (`apikey`, herdado da
 * Evolution API em Node, e `Authorization: Bearer`). Mandar os dois custa
 * bytes e evita um 401 que só apareceria em produção; o servidor ignora o que
 * não conhece. Quando a versão homologada for fixada e o Swagger dela
 * confirmar qual é, o outro sai daqui.
 *
 * **2. Leitura tolerante do corpo.** Os nomes de campo mudaram entre versões
 * (`instanceId`/`id`/`instance_id`, `key.id`/`messageId`/`id`). Em vez de
 * quebrar quando o formato muda, os helpers `texto()` e `objeto()` procuram o
 * valor em vários caminhos e o chamador decide o que fazer com a ausência.
 *
 * O Swagger da imagem em execução é o contrato final — ver
 * `docs/whatsapp/integracao-evolution-go.md`.
 */
@Injectable()
export class EvolutionGoClient {
  private readonly logger = new Logger(EvolutionGoClient.name);

  private get timeoutMs(): number {
    const bruto = Number(process.env.WHATSAPP_EVOLUTION_TIMEOUT_MS);
    return Number.isFinite(bruto) && bruto > 0 ? bruto : 15000;
  }

  /**
   * Teto do corpo de resposta aceito.
   *
   * Existe porque uma das rotas devolve mídia em Base64: sem limite, um vídeo
   * de dezenas de MB entra inteiro na memória da API antes de qualquer
   * validação. O limite é maior que o teto de anexo do WhatsApp (16 MiB), já
   * contando o inchaço do Base64.
   */
  private get maxRespostaBytes(): number {
    const bruto = Number(process.env.WHATSAPP_EVOLUTION_MAX_RESPOSTA_BYTES);
    return Number.isFinite(bruto) && bruto > 0 ? bruto : 32 * 1024 * 1024;
  }

  /**
   * Chamada crua ao gateway.
   *
   * `credencial` é a chave administrativa (`GLOBAL_API_KEY`) para o que cria e
   * apaga instância, e o token da própria instância para o que fala pela
   * conversa. Nunca entra em log — nem em caso de erro, onde a tentação é
   * despejar a requisição inteira.
   */
  async chamar<T>(
    baseUrl: string | null,
    caminho: string,
    opcoes: {
      metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      corpo?: unknown;
      credencial?: string | null;
      /** Trata 404 como ausência e devolve `null` em vez de estourar. */
      aceitarAusente?: boolean;
    } = {},
  ): Promise<T> {
    if (!baseUrl) {
      // Mensagem operacional de propósito: é o administrador que resolve, e
      // ele precisa saber exatamente onde configurar.
      throw new BadGatewayException(
        'A Evolution GO não está configurada. Informe o endereço do serviço em ' +
          'Administração > WhatsApp > Evolution GO.',
      );
    }

    const { metodo = 'GET', corpo, credencial, aceitarAusente } = opcoes;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `${baseUrl.replace(/\/+$/, '')}${caminho}`;

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        method: metodo,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(credencial
            ? { apikey: credencial, authorization: `Bearer ${credencial}` }
            : {}),
        },
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      // Só método e caminho: corpo e credencial ficam de fora do log.
      this.logger.error(`evolution ${metodo} ${caminho}: ${motivo}`);
      throw new BadGatewayException(
        'A Evolution GO não respondeu. Verifique se o serviço está no ar.',
      );
    } finally {
      clearTimeout(timer);
    }

    if (resposta.status === 404 && aceitarAusente) {
      return null as T;
    }

    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => '');
      this.logger.error(
        `evolution ${metodo} ${caminho}: ${resposta.status} ${texto.slice(0, 500)}`,
      );
      throw new BadGatewayException(
        `A Evolution GO recusou a operação (${resposta.status}).`,
      );
    }

    const tamanho = Number(resposta.headers.get('content-length') ?? 0);
    if (tamanho > this.maxRespostaBytes) {
      throw new BadGatewayException(
        'A Evolution GO devolveu uma resposta maior que o limite aceito.',
      );
    }

    const texto = await resposta.text();
    if (texto.length > this.maxRespostaBytes) {
      throw new BadGatewayException(
        'A Evolution GO devolveu uma resposta maior que o limite aceito.',
      );
    }
    if (!texto.trim()) return {} as T;

    try {
      return JSON.parse(texto) as T;
    } catch {
      // Resposta 2xx que não é JSON: acontece em rota que devolve texto puro
      // (`OK`). Não é erro, e transformar em exceção quebraria a operação que
      // de fato aconteceu do outro lado.
      return {} as T;
    }
  }
}

/**
 * Leitura tolerante de campo textual.
 *
 * Aceita caminho com ponto (`key.id`) porque a Evolution aninha o
 * identificador da mensagem em versões diferentes de profundidade.
 */
export function texto(fonte: unknown, ...caminhos: string[]): string | null {
  for (const caminho of caminhos) {
    let atual: unknown = fonte;
    for (const parte of caminho.split('.')) {
      if (atual === null || typeof atual !== 'object') {
        atual = undefined;
        break;
      }
      atual = (atual as Record<string, unknown>)[parte];
    }
    if (typeof atual === 'string' && atual.trim()) return atual;
    if (typeof atual === 'number') return String(atual);
  }
  return null;
}

/** Leitura tolerante de sub-objeto, com a mesma regra de caminhos. */
export function objeto(
  fonte: unknown,
  ...caminhos: string[]
): Record<string, unknown> | null {
  for (const caminho of caminhos) {
    let atual: unknown = fonte;
    for (const parte of caminho.split('.')) {
      if (atual === null || typeof atual !== 'object') {
        atual = undefined;
        break;
      }
      atual = (atual as Record<string, unknown>)[parte];
    }
    if (atual && typeof atual === 'object' && !Array.isArray(atual)) {
      return atual as Record<string, unknown>;
    }
  }
  return null;
}

/** Leitura tolerante de lista, com a mesma regra de caminhos. */
export function lista(fonte: unknown, ...caminhos: string[]): unknown[] {
  for (const caminho of caminhos) {
    let atual: unknown = fonte;
    for (const parte of caminho.split('.')) {
      if (atual === null || typeof atual !== 'object') {
        atual = undefined;
        break;
      }
      atual = (atual as Record<string, unknown>)[parte];
    }
    if (Array.isArray(atual)) return atual;
  }
  return Array.isArray(fonte) ? (fonte as unknown[]) : [];
}

export function booleano(fonte: unknown, ...caminhos: string[]): boolean {
  for (const caminho of caminhos) {
    let atual: unknown = fonte;
    for (const parte of caminho.split('.')) {
      if (atual === null || typeof atual !== 'object') {
        atual = undefined;
        break;
      }
      atual = (atual as Record<string, unknown>)[parte];
    }
    if (typeof atual === 'boolean') return atual;
    if (atual === 'true') return true;
    if (atual === 'false') return false;
  }
  return false;
}

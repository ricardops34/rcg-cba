import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type {
  ChamadaFerramenta,
  MensagemChat,
  ParametrosConversa,
  ProvedorClient,
  RespostaChat,
} from './provedor-ia';

/**
 * Cliente dos provedores que falam o **formato da OpenAI**
 * (`POST {baseUrl}/chat/completions`).
 *
 * Uma implementação serve todos eles — o que muda é endpoint, modelo e chave,
 * não o formato. A Anthropic tem o seu (`anthropic.client.ts`) e o Codex o
 * dele (`codex.client.ts`).
 */

interface CorpoResposta {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: {
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string } | string;
}

@Injectable()
export class OpenAiCompativelClient implements ProvedorClient {
  private readonly logger = new Logger(OpenAiCompativelClient.name);

  private obterTimeoutMs(url?: string): number {
    const bruto = Number(process.env.AGENTE_IA_TIMEOUT_MS);
    if (Number.isFinite(bruto) && bruto > 0) return bruto;
    // Local Docker / Ollama on CPU can take longer to generate
    return url && url.includes('ollama') ? 180_000 : 60_000;
  }

  async conversar(params: ParametrosConversa): Promise<RespostaChat> {
    const corpo = {
      model: params.modelo,
      temperature: params.temperatura,
      max_tokens: params.maxTokens,
      messages: params.mensagens.map((m) => this.paraFormatoProvedor(m)),
      ...(params.baseUrl.includes('ollama') ? { keep_alive: -1 } : {}),
      ...(params.ferramentas.length > 0
        ? {
            tools: params.ferramentas.map((f) => ({
              type: 'function',
              function: {
                name: f.nome,
                description: f.descricao,
                parameters: f.parametros,
              },
            })),
            tool_choice: 'auto',
          }
        : {}),
    };

    const dados = await this.chamar<CorpoResposta>(
      `${params.baseUrl}/chat/completions`,
      params.apiKey,
      corpo,
    );

    const mensagem = dados.choices?.[0]?.message;
    const chamadas: ChamadaFerramenta[] = (mensagem?.tool_calls ?? []).map(
      (c) => ({
        id: c.id ?? '',
        nome: c.function?.name ?? '',
        // O modelo devolve os argumentos como string JSON; JSON inválido não
        // pode derrubar a conversa — vira objeto vazio e a validação do
        // executor recusa com mensagem útil.
        argumentos: this.parseArgumentos(c.function?.arguments),
      }),
    );

    return {
      texto: mensagem?.content ?? null,
      chamadas,
      tokensEntrada: dados.usage?.prompt_tokens ?? null,
      tokensSaida: dados.usage?.completion_tokens ?? null,
    };
  }

  /**
   * Lista os modelos disponíveis na conta. Alimenta o botão "Testar conexão" —
   * assim o campo `modelo` é validado contra o que a conta realmente tem, em
   * vez de uma lista fixa no código que envelhece a cada lançamento.
   */
  async listarModelos(baseUrl: string, apiKey: string): Promise<string[]> {
    const dados = await this.chamar<{ data?: { id?: string }[] }>(
      `${baseUrl}/models`,
      apiKey,
      undefined,
    );
    return (dados.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => !!id)
      .sort();
  }

  /**
   * Extrai a mensagem legível do corpo de erro do provedor. O formato varia
   * (`{error: "texto"}` ou `{error: {message}}`), e devolver o JSON cru na
   * tela não ajuda ninguém.
   */
  private mensagemDoErro(corpo: string): string {
    if (!corpo) return '';
    try {
      const json: unknown = JSON.parse(corpo);
      const erro = (json as { error?: unknown })?.error;
      if (typeof erro === 'string') return erro;
      if (erro && typeof erro === 'object') {
        const m = (erro as { message?: unknown }).message;
        if (typeof m === 'string') return m;
      }
      const m = (json as { message?: unknown })?.message;
      if (typeof m === 'string') return m;
    } catch {
      // Não era JSON — devolve o texto cru, truncado.
    }
    return corpo.slice(0, 200);
  }

  private parseArgumentos(bruto: string | undefined): Record<string, unknown> {
    if (!bruto) return {};
    try {
      const v: unknown = JSON.parse(bruto);
      return typeof v === 'object' && v !== null
        ? (v as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private paraFormatoProvedor(m: MensagemChat) {
    if (m.papel === 'tool') {
      return {
        role: 'tool',
        tool_call_id: m.chamadaId,
        content: m.conteudo ?? '',
      };
    }
    if (m.papel === 'assistant' && m.chamadas?.length) {
      return {
        role: 'assistant',
        content: m.conteudo,
        tool_calls: m.chamadas.map((c) => ({
          id: c.id,
          type: 'function',
          function: {
            name: c.nome,
            arguments: JSON.stringify(c.argumentos),
          },
        })),
      };
    }
    // Anexo: `chat/completions` aceita imagem como `image_url` com data URI, e
    // **não** aceita PDF (isso é da Responses API). Recusar aqui, com o motivo,
    // é melhor do que mandar e receber de volta um erro do provedor que não
    // diz nada a quem anexou o arquivo.
    if (m.papel === 'user' && m.anexos?.length) {
      const pdf = m.anexos.find((a) => a.mime === 'application/pdf');
      if (pdf) {
        throw new BadGatewayException(
          'Este provedor não lê PDF pelo chat. Configure Anthropic ou Codex ' +
            'em Administração > Agente IA, ou anexe uma imagem.',
        );
      }
      const partes: unknown[] = m.anexos.map((a) => ({
        type: 'image_url',
        image_url: { url: `data:${a.mime};base64,${a.base64}` },
      }));
      if (m.conteudo) partes.push({ type: 'text', text: m.conteudo });
      return { role: 'user', content: partes };
    }

    return { role: m.papel, content: m.conteudo ?? '' };
  }

  private async chamar<T>(
    url: string,
    apiKey: string,
    corpo: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.obterTimeoutMs(url));
    const inicio = Date.now();

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        method: corpo === undefined ? 'GET' : 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      this.logger.error(`Erro ao conectar no provedor IA (${url}): ${msg}`);
      throw new BadGatewayException(
        erro instanceof Error && erro.name === 'AbortError'
          ? 'O provedor de IA não respondeu a tempo. Tente novamente.'
          : `Não foi possível falar com o provedor de IA no momento: ${msg}`,
      );
    } finally {
      clearTimeout(timer);
    }

    // Nem a chave nem o conteúdo da conversa entram no log.
    this.logger.log(`IA: ${resposta.status} em ${Date.now() - inicio}ms`);

    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => '');
      const mensagemProvedor = this.mensagemDoErro(detalhe);

      // Traduzido, porque quem lê é o administrador na tela, não o
      // desenvolvedor no console.
      //
      // A x.ai responde **400** para chave inválida, não 401 — por isso o
      // reconhecimento é pelo conteúdo, não só pelo status.
      const pareceChaveInvalida =
        resposta.status === 401 ||
        resposta.status === 403 ||
        /api key|apikey|unauthorized/i.test(mensagemProvedor);
      if (pareceChaveInvalida) {
        throw new BadGatewayException(
          'Chave de API recusada pelo provedor. Confira a chave na configuração do agente.',
        );
      }
      // Só pelo status: a mensagem de erro do provedor cita o nome do modelo
      // em várias situações (tamanho, limite de uso), e casar por "model" no
      // texto mandava o usuário conferir a lista de modelos por causa de um
      // payload grande demais.
      if (resposta.status === 404) {
        throw new BadGatewayException(
          'Modelo não encontrado no provedor. Use "Testar conexão" para ver os modelos disponíveis na sua conta.',
        );
      }
      if (resposta.status === 413) {
        throw new BadGatewayException(
          'A conversa ficou grande demais para o provedor. Comece uma conversa nova ' +
            'ou reduza o histórico em Administração > Agente IA.',
        );
      }
      if (resposta.status === 429) {
        throw new BadGatewayException(
          'Limite de uso do provedor atingido. Tente novamente em instantes.',
        );
      }
      throw new BadGatewayException(
        `O provedor de IA respondeu ${resposta.status}. ${mensagemProvedor}`.trim(),
      );
    }

    return (await resposta.json()) as T;
  }
}

import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type {
  ChamadaFerramenta,
  MensagemChat,
  ParametrosConversa,
  ProvedorClient,
  RespostaChat,
} from './provedor-ia';

/**
 * Adaptador da **Messages API da Anthropic** (Claude).
 *
 * A API não é compatível com o formato da OpenAI, e as diferenças não são
 * cosméticas — cada uma delas quebraria a chamada se traduzida errado:
 *
 * - `system` é **parâmetro de topo**, não uma mensagem com papel `system`;
 * - ferramenta declara `input_schema`, não `parameters`;
 * - a chamada de ferramenta volta como bloco `tool_use` dentro de `content`,
 *   com o `input` **já desserializado** (na OpenAI vem string JSON);
 * - o resultado da ferramenta volta numa mensagem de papel `user`, em blocos
 *   `tool_result` referenciando `tool_use_id`;
 * - `max_tokens` é obrigatório.
 *
 * E a pegadinha que mais custa caro: **`temperature` foi removido nos modelos
 * atuais** (Opus 5, Sonnet 5, Opus 4.8/4.7) — enviá-lo devolve 400. Por isso
 * este adaptador simplesmente não repassa a temperatura, mesmo que ela esteja
 * configurada na tela; o valor continua valendo para os provedores que aceitam.
 *
 * Usa o SDK oficial em vez de fetch cru: ele já traz os cabeçalhos de versão,
 * o retry e as classes de erro tipadas.
 */
@Injectable()
export class AnthropicClient implements ProvedorClient {
  private readonly logger = new Logger(AnthropicClient.name);

  private cliente(apiKey: string, baseUrl: string): Anthropic {
    return new Anthropic({
      apiKey,
      // baseURL só é passado quando difere do padrão (proxy/gateway próprio).
      ...(baseUrl && baseUrl !== 'https://api.anthropic.com'
        ? { baseURL: baseUrl }
        : {}),
    });
  }

  async conversar(params: ParametrosConversa): Promise<RespostaChat> {
    const anthropic = this.cliente(params.apiKey, params.baseUrl);
    const inicio = Date.now();

    // O papel `system` não existe no array de mensagens: vira parâmetro.
    const system = params.mensagens
      .filter((m) => m.papel === 'system')
      .map((m) => m.conteudo ?? '')
      .join('\n\n');

    const mensagens = params.mensagens
      .filter((m) => m.papel !== 'system')
      .map((m) => this.paraFormatoAnthropic(m));

    try {
      const resposta = await anthropic.messages.create({
        model: params.modelo,
        max_tokens: params.maxTokens,
        ...(system ? { system } : {}),
        messages: mensagens as never,
        ...(params.ferramentas.length > 0
          ? {
              tools: params.ferramentas.map((f) => ({
                name: f.nome,
                description: f.descricao,
                input_schema: f.parametros as never,
              })),
            }
          : {}),
        // `temperature` deliberadamente ausente — ver comentário da classe.
      });

      this.logger.log(`IA (anthropic): ok em ${Date.now() - inicio}ms`);

      // Os classificadores de segurança podem recusar: HTTP 200 com
      // stop_reason 'refusal' e conteúdo vazio. Sem tratar, o código leria
      // content[0] de um array vazio.
      if (resposta.stop_reason === 'refusal') {
        return {
          texto:
            'O provedor recusou responder a esta solicitação por política de conteúdo.',
          chamadas: [],
          tokensEntrada: resposta.usage?.input_tokens ?? null,
          tokensSaida: resposta.usage?.output_tokens ?? null,
        };
      }

      const textos: string[] = [];
      const chamadas: ChamadaFerramenta[] = [];
      for (const bloco of resposta.content) {
        if (bloco.type === 'text') textos.push(bloco.text);
        if (bloco.type === 'tool_use') {
          chamadas.push({
            id: bloco.id,
            nome: bloco.name,
            // Já vem objeto — não há JSON.parse aqui, ao contrário da OpenAI.
            argumentos: (bloco.input ?? {}) as Record<string, unknown>,
          });
        }
      }

      return {
        texto: textos.join('\n') || null,
        chamadas,
        tokensEntrada: resposta.usage?.input_tokens ?? null,
        tokensSaida: resposta.usage?.output_tokens ?? null,
      };
    } catch (erro) {
      throw this.traduzirErro(erro);
    }
  }

  async listarModelos(baseUrl: string, apiKey: string): Promise<string[]> {
    const anthropic = this.cliente(apiKey, baseUrl);
    try {
      const ids: string[] = [];
      // O list auto-pagina quando iterado — não usar `.data`.
      for await (const modelo of anthropic.models.list()) {
        ids.push(modelo.id);
      }
      return ids.sort();
    } catch (erro) {
      throw this.traduzirErro(erro);
    }
  }

  /**
   * Converte a mensagem interna para o formato da Messages API.
   *
   * O turno do assistente que pediu ferramenta precisa voltar **com os blocos
   * `tool_use` preservados** — mandar só o texto quebra o pareamento com o
   * `tool_result` seguinte.
   */
  private paraFormatoAnthropic(m: MensagemChat) {
    if (m.papel === 'tool') {
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: m.chamadaId,
            content: m.conteudo ?? '',
          },
        ],
      };
    }

    if (m.papel === 'assistant' && m.chamadas?.length) {
      const blocos: unknown[] = [];
      if (m.conteudo) blocos.push({ type: 'text', text: m.conteudo });
      for (const c of m.chamadas) {
        blocos.push({
          type: 'tool_use',
          id: c.id,
          name: c.nome,
          input: c.argumentos,
        });
      }
      return { role: 'assistant', content: blocos };
    }

    return { role: m.papel, content: m.conteudo ?? '' };
  }

  /** Classes tipadas do SDK — nada de casar string de mensagem de erro. */
  private traduzirErro(erro: unknown): BadGatewayException {
    if (erro instanceof Anthropic.AuthenticationError) {
      return new BadGatewayException(
        'Chave de API recusada pelo provedor. Confira a chave na configuração do agente.',
      );
    }
    if (erro instanceof Anthropic.PermissionDeniedError) {
      return new BadGatewayException(
        'A chave não tem permissão para este recurso no provedor.',
      );
    }
    if (erro instanceof Anthropic.NotFoundError) {
      return new BadGatewayException(
        'Modelo não encontrado no provedor. Use "Testar conexão" para ver os modelos disponíveis na sua conta.',
      );
    }
    if (erro instanceof Anthropic.RateLimitError) {
      return new BadGatewayException(
        'Limite de uso do provedor atingido. Tente novamente em instantes.',
      );
    }
    if (erro instanceof Anthropic.BadRequestError) {
      // Mantém a mensagem do provedor: aqui costuma estar o motivo real
      // (modelo inexistente, parâmetro não aceito, conversa grande demais).
      return new BadGatewayException(
        `O provedor recusou a requisição: ${erro.message}`,
      );
    }
    if (erro instanceof Anthropic.APIConnectionError) {
      return new BadGatewayException(
        'Não foi possível falar com o provedor de IA no momento.',
      );
    }
    if (erro instanceof Anthropic.APIError) {
      return new BadGatewayException(
        `O provedor de IA respondeu ${erro.status ?? ''}: ${erro.message}`.trim(),
      );
    }
    return new BadGatewayException('Falha inesperada ao falar com o provedor.');
  }
}

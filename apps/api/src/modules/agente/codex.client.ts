import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { PROVEDORES } from '@plataforma/contracts';
import type {
  ChamadaFerramenta,
  MensagemChat,
  ParametrosConversa,
  ProvedorClient,
  RespostaChat,
} from './provedor-ia';

/**
 * Adaptador do **backend do Codex** (`chatgpt.com/backend-api/codex`),
 * autenticado pelo login da assinatura ChatGPT.
 *
 * ⚠️ **Antes de mexer aqui, entenda o terreno.** Este endpoint é privado e não
 * documentado pela OpenAI: ele existe para os aplicativos oficiais do Codex
 * (CLI, extensão de IDE). Não há contrato de estabilidade — formato, headers e
 * whitelist podem mudar sem aviso e derrubar o agente em produção. E usar a
 * assinatura por fora daqueles aplicativos pode contrariar os termos de uso,
 * com risco de suspensão da conta. O caminho suportado para uso comercial
 * contínuo é o provedor `openai`, com chave de API.
 *
 * O que ele **não** é: não é o `api.openai.com` do provedor `openai`. Token
 * OAuth não funciona lá, chave de API não funciona aqui, e o formato é outro —
 * **Responses API**, não `chat/completions`:
 *
 * - o system prompt vai em `instructions`, fora das mensagens;
 * - `input` é uma lista de *itens* (mensagem, `function_call`,
 *   `function_call_output`), não de mensagens com papel;
 * - a ferramenta é declarada plana (`{type, name, parameters}`), sem o
 *   aninhamento em `function` da API de chat;
 * - o resultado da ferramenta é um item próprio referenciando `call_id`;
 * - `store: false` é obrigatório, e por isso os blocos de raciocínio precisam
 *   voltar junto na próxima volta do laço — daí o `bruto` em `MensagemChat`;
 * - a resposta vem em **SSE**, mesmo sem streaming do nosso lado.
 *
 * Os headers são conferidos pelo backend, e três deles derrubam a chamada se
 * estiverem errados: `ChatGPT-Account-ID` (401/403 sem ele), `originator`
 * (whitelist de primeira parte — 403 fora dela) e o `User-Agent` no formato
 * que o CLI usa.
 */

/** Único originator aceito pelo backend fora dos apps oficiais de IDE. */
const ORIGINATOR = 'codex_cli_rs';
/**
 * Versão anunciada no User-Agent. O backend confere o formato
 * `{originator}/{versão} (SO arquitetura)`; uma versão muito antiga é o tipo de
 * coisa que ele pode passar a recusar. Acompanha a do CLI (`client_version` em
 * `~/.codex/models_cache.json`).
 */
const VERSAO_CLIENTE = '0.149.0';
const USER_AGENT = `${ORIGINATOR}/${VERSAO_CLIENTE} (${process.platform} ${process.arch})`;

interface ItemSaida {
  type?: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  role?: string;
  content?: { type?: string; text?: string }[];
}

interface RespostaCodex {
  status?: string;
  output?: ItemSaida[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string };
}

@Injectable()
export class CodexClient implements ProvedorClient {
  private readonly logger = new Logger(CodexClient.name);

  private get timeoutMs(): number {
    const bruto = Number(process.env.AGENTE_IA_TIMEOUT_MS);
    return Number.isFinite(bruto) && bruto > 0 ? bruto : 120_000;
  }

  async conversar(params: ParametrosConversa): Promise<RespostaChat> {
    const instructions = params.mensagens
      .filter((m) => m.papel === 'system')
      .map((m) => m.conteudo ?? '')
      .join('\n\n');

    const input = params.mensagens
      .filter((m) => m.papel !== 'system')
      .flatMap((m) => this.paraItens(m));

    const corpo = {
      model: params.modelo,
      // `instructions` é obrigatório e não pode ser vazio.
      instructions: instructions || 'Você é um assistente interno.',
      input,
      ...(params.ferramentas.length > 0
        ? {
            tools: params.ferramentas.map((f) => ({
              type: 'function',
              name: f.nome,
              description: f.descricao,
              parameters: f.parametros,
              // `strict` exigiria `additionalProperties: false` e todos os
              // campos em `required` nos schemas do catálogo — que hoje têm
              // parâmetros opcionais de propósito.
              strict: false,
            })),
            tool_choice: 'auto',
            // Uma ferramenta por volta: o laço em `agente-chat.service.ts`
            // executa em sequência de qualquer forma, e chamadas paralelas só
            // tornariam mais difícil ligar a pendência de escrita ao pedido.
            parallel_tool_calls: false,
          }
        : {}),
      // `max_output_tokens` **não é aceito** por este backend (400
      // "Unsupported parameter") — o limite quem impõe é a assinatura. Por
      // isso o campo "máximo de tokens" da tela não vale para o Codex.
      //
      // Esforço baixo de propósito: as perguntas do agente são consultas a
      // ferramenta, não problemas de raciocínio longo.
      reasoning: { effort: 'low' },
      // Sem persistir a conversa do lado da OpenAI. Consequência direta: o
      // raciocínio precisa voltar cifrado no `input` da próxima volta.
      include: ['reasoning.encrypted_content'],
      store: false,
      stream: true,
      // `temperature` deliberadamente ausente — os modelos de reasoning não
      // aceitam o parâmetro.
    };

    const resposta = await this.chamar(params, corpo);
    return this.interpretar(resposta);
  }

  /**
   * O backend do Codex **não expõe** um endpoint de modelos, então o "Testar
   * conexão" não consegue conferir o campo `modelo` contra a conta como faz
   * nos outros provedores. Devolve a lista fixa dos contratos, que envelhece
   * no código — é a troca que este backend impõe.
   */
  listarModelos(): Promise<string[]> {
    return Promise.resolve([...(PROVEDORES.codex.modelos ?? [])]);
  }

  // ---------------- formato ----------------

  /** Uma mensagem interna vira um ou mais itens da Responses API. */
  private paraItens(m: MensagemChat): unknown[] {
    if (m.papel === 'tool') {
      return [
        {
          type: 'function_call_output',
          call_id: m.chamadaId,
          output: m.conteudo ?? '',
        },
      ];
    }

    if (m.papel === 'assistant') {
      // Preferir os itens crus: eles carregam o raciocínio cifrado, que o
      // backend exige de volta junto do `function_call` correspondente.
      if (m.bruto?.length) return m.bruto;

      const itens: unknown[] = [];
      if (m.conteudo) {
        itens.push({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: m.conteudo }],
        });
      }
      for (const c of m.chamadas ?? []) {
        itens.push({
          type: 'function_call',
          call_id: c.id,
          name: c.nome,
          arguments: JSON.stringify(c.argumentos),
        });
      }
      return itens;
    }

    return [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: m.conteudo ?? '' }],
      },
    ];
  }

  private interpretar(resposta: RespostaCodex): RespostaChat {
    const textos: string[] = [];
    const chamadas: ChamadaFerramenta[] = [];

    for (const item of resposta.output ?? []) {
      if (item.type === 'message') {
        for (const parte of item.content ?? []) {
          if (parte.type === 'output_text' && parte.text) {
            textos.push(parte.text);
          }
        }
      }
      if (item.type === 'function_call') {
        chamadas.push({
          id: item.call_id ?? item.id ?? '',
          nome: item.name ?? '',
          argumentos: this.parseArgumentos(item.arguments),
        });
      }
    }

    // Raciocínio longo demais come todo o orçamento de saída e a resposta volta
    // vazia. Sem esta mensagem o usuário veria um balão em branco.
    if (
      textos.length === 0 &&
      chamadas.length === 0 &&
      resposta.status === 'incomplete'
    ) {
      return {
        texto:
          'A resposta foi interrompida por limite de tamanho antes de ser escrita. ' +
          'Aumente "máximo de tokens" em Administração > Agente IA ou refaça a ' +
          'pergunta de forma mais direta.',
        chamadas: [],
        tokensEntrada: resposta.usage?.input_tokens ?? null,
        tokensSaida: resposta.usage?.output_tokens ?? null,
      };
    }

    return {
      texto: textos.join('\n') || null,
      chamadas,
      tokensEntrada: resposta.usage?.input_tokens ?? null,
      tokensSaida: resposta.usage?.output_tokens ?? null,
      // Guardado para reenviar na próxima volta — ver `MensagemChat.bruto`.
      bruto: resposta.output ?? [],
    };
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

  // ---------------- transporte ----------------

  private async chamar(
    params: ParametrosConversa,
    corpo: unknown,
  ): Promise<RespostaCodex> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const inicio = Date.now();

    let resposta: Response;
    try {
      resposta = await fetch(`${params.baseUrl}/responses`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          // PascalCase importa: o backend não reconhece a variante minúscula.
          'ChatGPT-Account-ID': params.contaId ?? '',
          originator: ORIGINATOR,
          'User-Agent': USER_AGENT,
          'OpenAI-Beta': 'responses=experimental',
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(corpo),
      });
    } catch (erro) {
      throw new BadGatewayException(
        erro instanceof Error && erro.name === 'AbortError'
          ? 'O Codex não respondeu a tempo. Tente novamente.'
          : 'Não foi possível falar com o Codex no momento.',
      );
    } finally {
      clearTimeout(timer);
    }

    this.logger.log(`IA (codex): ${resposta.status} em ${Date.now() - inicio}ms`);

    if (!resposta.ok) {
      throw this.traduzirErro(resposta.status, await resposta.text().catch(() => ''));
    }

    return this.lerEventos(resposta);
  }

  /**
   * Lê o SSE até o evento final.
   *
   * Dois detalhes deste backend, os dois confirmados contra ele e os dois
   * capazes de fazer a resposta chegar vazia sem erro nenhum:
   *
   * 1. **O `response.completed` vem com `output` vazio.** Os itens da resposta
   *    (texto, `function_call`, `reasoning`) chegam um a um em
   *    `response.output_item.done`, e é preciso acumulá-los — confiar no
   *    `output` do evento final devolve sempre lista vazia.
   * 2. **Não há `Content-Type`.** Ele responde o stream sem o cabeçalho, então
   *    decidir pelo tipo (e cair num `resposta.json()`) quebra no primeiro
   *    caractere do SSE.
   */
  private async lerEventos(resposta: Response): Promise<RespostaCodex> {
    const corpo = resposta.body as unknown as AsyncIterable<Uint8Array> | null;
    if (!corpo) {
      throw new BadGatewayException('O Codex respondeu sem conteúdo.');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let concluida: RespostaCodex | null = null;
    let falha: string | null = null;
    /** Ver ponto 1 acima. */
    const itens: ItemSaida[] = [];

    for await (const pedaco of corpo) {
      buffer += decoder.decode(pedaco, { stream: true });

      // Eventos são separados por linha em branco; o resto fica no buffer.
      let corte = buffer.indexOf('\n\n');
      while (corte !== -1) {
        const evento = buffer.slice(0, corte);
        buffer = buffer.slice(corte + 2);
        corte = buffer.indexOf('\n\n');

        const dados = evento
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('');
        if (!dados || dados === '[DONE]') continue;

        let json: {
          type?: string;
          response?: RespostaCodex;
          item?: ItemSaida;
          message?: string;
          error?: { message?: string };
        };
        try {
          json = JSON.parse(dados) as typeof json;
        } catch {
          continue; // keep-alive ou fragmento — não é motivo para derrubar.
        }

        if (json.type === 'response.output_item.done' && json.item) {
          itens.push(json.item);
        }
        if (json.type === 'response.completed' && json.response) {
          concluida = json.response;
        }
        if (json.type === 'response.incomplete' && json.response) {
          concluida = { ...json.response, status: 'incomplete' };
        }
        if (json.type === 'response.failed') {
          falha = json.response?.error?.message ?? 'motivo não informado';
        }
        if (json.type === 'error') {
          falha = json.error?.message ?? json.message ?? 'erro no stream';
        }
      }
    }

    if (falha) {
      throw new BadGatewayException(`O Codex recusou a requisição: ${falha}`);
    }
    if (!concluida) {
      throw new BadGatewayException(
        'O Codex encerrou a resposta antes de concluí-la. Tente novamente.',
      );
    }
    // Ver ponto 1 no comentário do método: os itens acumulados são a resposta
    // de verdade. O `output` do evento final só é usado se algum dia vier
    // preenchido.
    return concluida.output?.length ? concluida : { ...concluida, output: itens };
  }

  /** Traduzido para o administrador na tela, não para o console. */
  private traduzirErro(status: number, detalhe: string): BadGatewayException {
    const mensagem = this.mensagemDoErro(detalhe);

    if (status === 401) {
      return new BadGatewayException(
        'O ChatGPT recusou o token de acesso. Reconecte a conta em ' +
          'Administração > Agente IA.',
      );
    }
    if (status === 403) {
      return new BadGatewayException(
        'O ChatGPT recusou a requisição (403). Isso costuma ser conta sem plano ' +
          'com Codex, workspace com restrição de residência de dados, ou o backend ' +
          'passando a recusar este tipo de cliente.' + (mensagem ? ` ${mensagem}` : ''),
      );
    }
    if (status === 404) {
      return new BadGatewayException(
        `Modelo "${mensagem || 'informado'}" não disponível nesta assinatura. ` +
          'Escolha outro na lista de modelos do Codex.',
      );
    }
    if (status === 429) {
      return new BadGatewayException(
        'O limite de uso da assinatura ChatGPT foi atingido. Ele é por janela ' +
          '(horas/semana) e não se resolve tentando de novo em seguida.',
      );
    }
    return new BadGatewayException(
      `O Codex respondeu ${status}. ${mensagem}`.trim(),
    );
  }

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
      // Não era JSON.
    }
    return corpo.slice(0, 200);
  }
}

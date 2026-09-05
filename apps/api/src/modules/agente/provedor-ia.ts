/**
 * Contrato comum dos provedores de IA.
 *
 * Existem três formatos de API aqui, não um:
 *
 * - **OpenAI-compatível** (`chat/completions`) — a própria OpenAI e qualquer
 *   provedor que copie o formato dela; trocar entre eles é trocar endpoint,
 *   modelo e chave.
 * - **Messages API da Anthropic** — formato próprio (system fora das
 *   mensagens, `input_schema`, blocos `tool_use`/`tool_result`), com
 *   adaptador dedicado.
 * - **Responses API do Codex** — outro formato ainda (`instructions`, itens de
 *   `input`, resposta em SSE), num backend privado autenticado por OAuth.
 *
 * O resto do agente conversa só com esta interface: o laço de conversa
 * (`agente-chat.service.ts`) não sabe qual provedor está atendendo, e trocar
 * de provedor não toca em ferramenta, permissão nem auditoria.
 */

export interface FerramentaChat {
  nome: string;
  descricao: string;
  /** JSON Schema dos parâmetros. */
  parametros: Record<string, unknown>;
}

export interface ChamadaFerramenta {
  id: string;
  nome: string;
  argumentos: Record<string, unknown>;
}

/**
 * Arquivo que acompanha uma mensagem do usuário.
 *
 * Existe porque a ficha técnica chega como PDF e a foto do produto como
 * imagem: quem transforma o documento em texto é o próprio modelo, uma vez, no
 * momento do anexo — depois disso o que fica gravado é o Markdown, e nenhum
 * modelo recebe o arquivo de novo.
 *
 * Nem todo provedor lê todo tipo. A OpenAI-compatível (`chat/completions`) lê
 * imagem e **não** lê PDF; quem não suporta recusa com uma mensagem que diz
 * isso, em vez de mandar a requisição e receber um erro de API sem sentido
 * para quem está do outro lado.
 */
export interface AnexoChat {
  /** Nome original, só para o modelo ter contexto do que está lendo. */
  nome: string;
  mime: string;
  /** Conteúdo em base64, sem o prefixo `data:`. */
  base64: string;
}

export interface MensagemChat {
  papel: 'system' | 'user' | 'assistant' | 'tool';
  conteudo: string | null;
  /** Arquivos anexados a este turno. Só faz sentido em `papel: 'user'`. */
  anexos?: AnexoChat[];
  /** Preenchido quando papel = 'tool'. */
  chamadaId?: string;
  /** Preenchido quando o assistente pede ferramentas. */
  chamadas?: ChamadaFerramenta[];
  /**
   * Itens do turno do assistente no formato **nativo** do provedor, quando ele
   * exige recebê-los de volta na volta seguinte do laço.
   *
   * Existe por causa do Codex: a Responses API com `store: false` obriga a
   * devolver os blocos de raciocínio junto do `function_call` a que eles se
   * referem, e esses blocos não cabem em `chamadas`. Os demais provedores
   * ignoram o campo — quem preenche é quem lê.
   */
  bruto?: unknown[];
}

export interface RespostaChat {
  texto: string | null;
  chamadas: ChamadaFerramenta[];
  tokensEntrada: number | null;
  tokensSaida: number | null;
  /** Ver `MensagemChat.bruto`. */
  bruto?: unknown[];
}

export interface ParametrosConversa {
  baseUrl: string;
  /**
   * Credencial de acesso. Para os provedores de chave é a própria chave; para
   * o Codex é o **access token OAuth já renovado** — quem chama garante que
   * ele está válido (ver `AgenteConfigService.paraUso`).
   */
  apiKey: string;
  /**
   * Conta ChatGPT dona da assinatura, só para o Codex: vira o header
   * `ChatGPT-Account-ID`, sem o qual o backend devolve 401/403.
   */
  contaId?: string | null;
  modelo: string;
  /**
   * Ignorada pelos provedores que não aceitam o parâmetro — a Anthropic
   * removeu `temperature` nos modelos atuais e devolve 400 se ele for
   * enviado. Quem implementa decide se repassa.
   */
  temperatura: number;
  maxTokens: number;
  mensagens: MensagemChat[];
  ferramentas: FerramentaChat[];
}

export interface ProvedorClient {
  conversar(params: ParametrosConversa): Promise<RespostaChat>;
  /** Modelos disponíveis na conta — alimenta o botão "Testar conexão". */
  listarModelos(baseUrl: string, apiKey: string): Promise<string[]>;
}

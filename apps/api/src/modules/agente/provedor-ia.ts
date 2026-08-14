/**
 * Contrato comum dos provedores de IA.
 *
 * Existem dois formatos de API no mundo real, não um:
 *
 * - **OpenAI-compatível** — usado por xAI (Grok), Groq e a própria OpenAI.
 *   Uma implementação serve os três; trocar entre eles é trocar endpoint,
 *   modelo e chave.
 * - **Messages API da Anthropic** — formato próprio (system fora das
 *   mensagens, `input_schema`, blocos `tool_use`/`tool_result`), com
 *   adaptador dedicado.
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

export interface MensagemChat {
  papel: 'system' | 'user' | 'assistant' | 'tool';
  conteudo: string | null;
  /** Preenchido quando papel = 'tool'. */
  chamadaId?: string;
  /** Preenchido quando o assistente pede ferramentas. */
  chamadas?: ChamadaFerramenta[];
}

export interface RespostaChat {
  texto: string | null;
  chamadas: ChamadaFerramenta[];
  tokensEntrada: number | null;
  tokensSaida: number | null;
}

export interface ParametrosConversa {
  baseUrl: string;
  apiKey: string;
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

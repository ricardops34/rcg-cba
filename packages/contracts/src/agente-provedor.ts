import { z } from "zod";

/**
 * Provedores de IA suportados pelo agente.
 *
 * Três deles (xAI, Groq, OpenAI) falam o **mesmo formato** — o da API de
 * chat completions da OpenAI —, então dividem uma implementação só e trocar
 * entre eles é trocar endpoint e modelo.
 *
 * A **Anthropic é diferente**: a Messages API tem outro formato de mensagem,
 * outro cabeçalho de autenticação e outro formato de ferramenta. Por isso ela
 * tem um adaptador próprio (`anthropic.client.ts`), e por isso o provedor é um
 * campo de primeira classe aqui em vez de só uma baseUrl diferente.
 */
export const provedorIaSchema = z.enum(["xai", "groq", "openai", "anthropic"]);
export type ProvedorIa = z.infer<typeof provedorIaSchema>;

export interface ProvedorInfo {
  rotulo: string;
  baseUrl: string;
  modeloPadrao: string;
  /** Onde o usuário obtém a chave — vai na tela, evita busca no Google. */
  urlChave: string;
  /** Prefixo típico da chave, para a tela avisar quando parecer de outro provedor. */
  prefixoChave: string | null;
  /**
   * A família OpenAI-compatível aceita `temperature`; a Anthropic **removeu**
   * o parâmetro nos modelos atuais — enviá-lo devolve 400. A tela usa isto
   * para esconder o controle em vez de deixar o usuário configurar algo que
   * quebra a chamada.
   */
  aceitaTemperatura: boolean;
}

export const PROVEDORES: Record<ProvedorIa, ProvedorInfo> = {
  anthropic: {
    rotulo: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com",
    modeloPadrao: "claude-opus-5",
    urlChave: "https://console.anthropic.com/settings/keys",
    prefixoChave: "sk-ant-",
    aceitaTemperatura: false,
  },
  openai: {
    rotulo: "ChatGPT (OpenAI)",
    baseUrl: "https://api.openai.com/v1",
    modeloPadrao: "gpt-5",
    urlChave: "https://platform.openai.com/api-keys",
    prefixoChave: "sk-",
    aceitaTemperatura: true,
  },
  xai: {
    rotulo: "Grok (xAI)",
    baseUrl: "https://api.x.ai/v1",
    modeloPadrao: "grok-4-fast",
    urlChave: "https://console.x.ai",
    prefixoChave: "xai-",
    aceitaTemperatura: true,
  },
  groq: {
    rotulo: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    modeloPadrao: "llama-3.3-70b-versatile",
    urlChave: "https://console.groq.com/keys",
    prefixoChave: "gsk_",
    aceitaTemperatura: true,
  },
};

/** Uma credencial gravada por provedor — trocar de provedor não perde a chave. */
export const agenteCredencialSchema = z.object({
  provedor: provedorIaSchema,
  apiKeyUltimos4: z.string().nullable(),
  apiKeyPreenchida: z.boolean(),
  modelo: z.string().nullable().describe("Último modelo usado neste provedor"),
});
export type AgenteCredencial = z.infer<typeof agenteCredencialSchema>;

import { z } from "zod";

/**
 * Provedores de IA suportados pelo agente.
 *
 * O **OpenAI** fala o formato da API de chat completions, que é o mais comum:
 * qualquer provedor compatível com ela (e já houve outros aqui) entra
 * reaproveitando a mesma implementação, trocando só endpoint e modelo.
 *
 * A **Anthropic é diferente**: a Messages API tem outro formato de mensagem,
 * outro cabeçalho de autenticação e outro formato de ferramenta. Por isso ela
 * tem um adaptador próprio (`anthropic.client.ts`), e por isso o provedor é um
 * campo de primeira classe aqui em vez de só uma baseUrl diferente.
 *
 * O **Codex** é o terceiro caso, e o mais atípico: não usa chave de API, e sim
 * o login OAuth da assinatura ChatGPT — o mesmo do `codex login`. Fala a
 * Responses API num endpoint privado da OpenAI (`chatgpt.com/backend-api`),
 * que não é o `api.openai.com` do provedor `openai`. Ver as ressalvas em
 * `codex.client.ts` antes de habilitá-lo.
 */
export const provedorIaSchema = z.enum(["openai", "anthropic", "codex"]);
export type ProvedorIa = z.infer<typeof provedorIaSchema>;

/**
 * Como o provedor é autenticado.
 *
 * `apikey` — o administrador cola uma chave na tela; ela vale até ser trocada.
 * `oauth`  — o administrador conecta uma conta e o servidor passa a guardar um
 *            par de tokens que **expira e precisa ser renovado sozinho**. A
 *            tela muda por completo entre os dois: um campo de senha contra um
 *            botão "Conectar" com estado de conexão.
 */
export const autenticacaoProvedorSchema = z.enum(["apikey", "oauth"]);
export type AutenticacaoProvedor = z.infer<typeof autenticacaoProvedorSchema>;

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
  /** Chave de API colada na tela, ou conta conectada por OAuth. */
  autenticacao: AutenticacaoProvedor;
  /**
   * Lista fixa de modelos, para os provedores que **não** expõem um endpoint
   * de listagem. Só o Codex está nesse caso: o backend privado não tem
   * `/models`, então o "Testar conexão" não consegue conferir o campo `modelo`
   * contra a conta e cai para esta lista, que envelhece no código.
   */
  modelos?: string[];
  /** Aviso exibido na tela antes de conectar. Hoje só o Codex tem. */
  advertencia?: string;
}

export const PROVEDORES: Record<ProvedorIa, ProvedorInfo> = {
  anthropic: {
    rotulo: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com",
    modeloPadrao: "claude-opus-5",
    urlChave: "https://console.anthropic.com/settings/keys",
    prefixoChave: "sk-ant-",
    aceitaTemperatura: false,
    autenticacao: "apikey",
  },
  openai: {
    rotulo: "ChatGPT (OpenAI)",
    baseUrl: "https://api.openai.com/v1",
    modeloPadrao: "gpt-5",
    urlChave: "https://platform.openai.com/api-keys",
    prefixoChave: "sk-",
    aceitaTemperatura: true,
    autenticacao: "apikey",
  },
  codex: {
    rotulo: "Codex (assinatura ChatGPT)",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    modeloPadrao: "gpt-5.6-sol",
    urlChave: "https://chatgpt.com/codex",
    prefixoChave: null,
    // Os modelos de reasoning do Codex não aceitam `temperature`.
    aceitaTemperatura: false,
    autenticacao: "oauth",
    /**
     * Conferidos um a um contra o backend (2026-08-24). Os nomes da API
     * pública (`gpt-5`, `gpt-5.1-codex`, …) são **recusados** aqui: com conta
     * ChatGPT o backend só aceita estes. A lista de referência do CLI fica em
     * `~/.codex/models_cache.json`.
     */
    modelos: [
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
    ],
    advertencia:
      "O Codex autentica com o login da assinatura ChatGPT, não com chave de API. " +
      "O endpoint usado é privado e não documentado pela OpenAI, e o uso da assinatura " +
      "fora dos aplicativos oficiais (CLI, IDE) pode contrariar os termos de uso e levar " +
      "à suspensão da conta. Para uso comercial contínuo, o provedor ChatGPT (OpenAI) com " +
      "chave de API é o caminho suportado.",
  },
};

/** Uma credencial gravada por provedor — trocar de provedor não perde a chave. */
export const agenteCredencialSchema = z.object({
  provedor: provedorIaSchema,
  apiKeyUltimos4: z.string().nullable(),
  apiKeyPreenchida: z.boolean(),
  modelo: z.string().nullable().describe("Último modelo usado neste provedor"),
  // --- só para provedor com autenticacao = "oauth" ---
  /** Conta ChatGPT conectada. Nunca o token: só o identificador da conta. */
  contaId: z.string().nullable().default(null),
  /** E-mail da conta conectada, para a tela dizer *qual* conta está ligada. */
  contaEmail: z.string().nullable().default(null),
  /**
   * Quando o access token expira. A tela mostra isso porque a renovação é
   * automática mas **silenciosa**: se o refresh token for revogado do lado da
   * OpenAI, o agente para, e este campo é a primeira pista.
   */
  tokenExpiraEm: z.string().datetime().nullable().default(null),
  conectado: z.boolean().default(false),
});
export type AgenteCredencial = z.infer<typeof agenteCredencialSchema>;

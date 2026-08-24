import { z } from "zod";
import { agenteCredencialSchema, provedorIaSchema } from "./agente-provedor";

/**
 * Agente interno de IA: configuração por empresa e conversa com ferramentas.
 *
 * A chave de API nunca trafega de volta — a leitura devolve só os últimos 4
 * caracteres e a marca de preenchida, como o parâmetro de tipo senha.
 */

/**
 * System prompt padrão, gravado na criação da configuração.
 *
 * Escrito para este sistema, não genérico: descreve o que o agente é, o que
 * ele pode e não pode fazer, e — o mais importante — as regras que evitam os
 * dois erros caros num ERP: inventar número e afirmar que gravou algo.
 *
 * O servidor **acrescenta** a este texto um bloco de contexto da sessão
 * (usuário, empresa, data, ferramentas liberadas), então não repita isso aqui.
 * É um ponto de partida para o administrador ajustar em Administração >
 * Agente IA, não um texto imutável.
 */
export const SYSTEM_PROMPT_PADRAO = `Você é o assistente interno da equipe comercial. Ajuda vendedores, supervisores e gerentes a consultar o sistema e a preparar trabalho, conversando em português do Brasil.

## Como responder
Direto e curto, como um colega experiente do time. Comece pela resposta — o número, o nome, a conclusão — e só depois o detalhe, se ele mudar o que a pessoa faria em seguida. Nada de preâmbulo ("Claro!", "Vou verificar...") nem de recapitular a pergunta.

Use tabela só para listas de fatos curtos (produtos, títulos, meses). Para uma pergunta simples, responda em uma frase.

## Sobre os números
Todo número, código ou nome que você citar tem que ter vindo de uma ferramenta nesta conversa. Se não veio, diga que não sabe e ofereça consultar — **nunca estime, arredonde de memória ou complete um dado que faltou**. Num sistema comercial, um número inventado vira decisão errada.

Se uma consulta não retornou nada, diga que não encontrou. Não conclua que o dado não existe: você só enxerga a carteira de clientes que este usuário alcança.

## Sobre gravar
Ações que gravam (criar orçamento, por exemplo) não são executadas por você — elas ficam aguardando o usuário confirmar na tela. Então:
- descreva o que será gravado, com os valores, e peça a confirmação;
- **nunca diga que gravou, criou ou salvou algo antes de receber a confirmação**;
- se a pessoa pedir algo que você não tem permissão para fazer, diga isso com clareza e siga com o que dá para fazer.

## Quando faltar informação
Se o pedido for ambíguo de um jeito que mude o resultado (qual cliente entre dois de nome parecido, qual período), pergunte. Se der para decidir de forma razoável, decida e diga o que assumiu.`;

export const agenteConfigUpdateSchema = z.object({
  ativo: z.boolean().optional(),
  baseUrl: z.string().trim().url().max(200).optional(),
  modelo: z.string().trim().min(1).max(80).optional(),
  // Vazio = manter a chave atual. Nunca é devolvida para ser redigitada.
  apiKey: z.string().trim().max(200).optional(),
  systemPrompt: z.string().max(8000).nullable().optional(),
  provedor: provedorIaSchema.optional(),
  temperatura: z.coerce.number().min(0).max(2).optional(),
  maxTokens: z.coerce.number().int().min(256).max(32000).optional(),
  maxIteracoesFerramentas: z.coerce.number().int().min(1).max(10).optional(),
  historicoMensagens: z.coerce.number().int().min(2).max(100).optional(),
});
export type AgenteConfigUpdate = z.infer<typeof agenteConfigUpdateSchema>;

export const agenteConfigSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  ativo: z.boolean(),
  provedor: provedorIaSchema,
  credenciais: z.array(agenteCredencialSchema).default([]),
  baseUrl: z.string(),
  modelo: z.string(),
  apiKeyUltimos4: z.string().nullable(),
  apiKeyPreenchida: z.boolean(),
  systemPrompt: z.string().nullable(),
  temperatura: z.number(),
  maxTokens: z.number().int(),
  maxIteracoesFerramentas: z.number().int(),
  historicoMensagens: z.number().int(),
});
export type AgenteConfig = z.infer<typeof agenteConfigSchema>;

export const agenteTestarConexaoSchema = z.object({
  apiKey: z.string().trim().max(200).optional(),
  // Permite testar um provedor antes de gravá-lo como o ativo.
  provedor: provedorIaSchema.optional(),
});
export type AgenteTestarConexao = z.infer<typeof agenteTestarConexaoSchema>;

/**
 * Início do fluxo OAuth do Codex.
 *
 * O `redirect_uri` do cliente OAuth do Codex é fixo em `localhost:1455` e não
 * pode ser trocado — é o cliente público do CLI oficial. Um servidor não
 * consegue receber o callback, então o fluxo é em duas etapas: a API devolve a
 * URL de autorização, o administrador abre no próprio navegador, o redirect
 * falha (nada escutando em localhost) e ele **cola a URL da barra de endereço**
 * de volta na tela. O `code` está nela, e o `code_verifier` nunca saiu daqui.
 */
export const agenteOauthInicioSchema = z.object({
  url: z.string().url(),
  /** Eco do state, só para a tela poder conferir antes de enviar. */
  state: z.string(),
  expiraEm: z.string().datetime(),
});
export type AgenteOauthInicio = z.infer<typeof agenteOauthInicioSchema>;

export const agenteOauthConcluirSchema = z.object({
  /**
   * A URL inteira do callback (`http://localhost:1455/auth/callback?code=...`)
   * ou apenas o `code`. Aceitar as duas evita a etapa mais fácil de errar:
   * pedir para o usuário recortar um parâmetro no meio de uma URL longa.
   */
  retorno: z.string().trim().min(1).max(4000),
});
export type AgenteOauthConcluir = z.infer<typeof agenteOauthConcluirSchema>;

/**
 * Caminho alternativo: importar a sessão de um Codex CLI já logado, colando o
 * conteúdo de `~/.codex/auth.json`. Evita todo o vaivém de URL para quem já
 * usa o CLI na própria máquina.
 */
export const agenteOauthImportarSchema = z.object({
  conteudo: z.string().trim().min(1).max(20000),
});
export type AgenteOauthImportar = z.infer<typeof agenteOauthImportarSchema>;

export const agenteEnvioSchema = z.object({
  conversaId: z.string().uuid().optional(),
  texto: z.string().trim().min(1).max(4000),
});
export type AgenteEnvio = z.infer<typeof agenteEnvioSchema>;

export const agentePendenciaSchema = z.object({
  id: z.string().uuid(),
  ferramenta: z.string(),
  resumo: z.string(),
  argumentos: z.record(z.unknown()),
});
export type AgentePendencia = z.infer<typeof agentePendenciaSchema>;

export const agenteRespostaSchema = z.object({
  conversaId: z.string().uuid(),
  texto: z.string().nullable(),
  // Ações que gravam, aguardando o Confirmar do usuário. Nada foi gravado.
  pendencias: z.array(agentePendenciaSchema),
});
export type AgenteResposta = z.infer<typeof agenteRespostaSchema>;

export const agentePapelSchema = z.enum([
  "usuario",
  "sistema",
  "assistente",
  "ferramenta",
]);
export type AgentePapel = z.infer<typeof agentePapelSchema>;

export const agenteMensagemSchema = z.object({
  id: z.string().uuid(),
  papel: agentePapelSchema,
  conteudo: z.string().nullable(),
  ferramenta: z.string().nullable(),
  pendente: z.boolean(),
  confirmadaEm: z.string().datetime().nullable(),
  criadaEm: z.string().datetime(),
});
export type AgenteMensagem = z.infer<typeof agenteMensagemSchema>;

export const agenteConversaSchema = z.object({
  id: z.string().uuid(),
  titulo: z.string().nullable(),
  mensagens: z.array(agenteMensagemSchema),
});
export type AgenteConversa = z.infer<typeof agenteConversaSchema>;

export const AGENTE_CONFIG_EXAMPLE: AgenteConfig = {
  id: "6e7f8091-a2b3-4c4d-8e5f-6a7b8c9d0e1f",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  ativo: true,
  provedor: "anthropic",
  credenciais: [
    {
      provedor: "anthropic",
      apiKeyUltimos4: "9f2c",
      apiKeyPreenchida: true,
      modelo: "claude-opus-5",
      contaId: null,
      contaEmail: null,
      tokenExpiraEm: null,
      conectado: false,
    },
  ],
  baseUrl: "https://api.anthropic.com",
  modelo: "claude-opus-5",
  apiKeyUltimos4: "9f2c",
  apiKeyPreenchida: true,
  systemPrompt:
    "Você é o assistente da RCG Distribuidora. Responda em pt-BR, de forma curta e direta.",
  temperatura: 0.3,
  maxTokens: 2048,
  maxIteracoesFerramentas: 5,
  historicoMensagens: 20,
};

export const AGENTE_RESPOSTA_EXAMPLE: AgenteResposta = {
  conversaId: "2b3c4d5e-6f70-4819-a2b3-c4d5e6f70819",
  texto:
    "Montei o orçamento com 3 itens para METALÚRGICA XPTO, total R$ 1.880,00. Confirma para eu gravar?",
  pendencias: [
    {
      id: "8c9d0e1f-2a3b-4c5d-9e6f-7a8b9c0d1e2f",
      ferramenta: "criar_orcamento",
      resumo: 'Orçamento "Reposição agosto" com 3 item(ns)',
      argumentos: {},
    },
  ],
};

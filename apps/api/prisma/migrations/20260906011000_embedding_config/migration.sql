-- Configuração do gerador de embeddings, separada da do chat.
--
-- Não é capricho de organização: o provedor de conversa pode não gerar vetor —
-- o Codex por OAuth não gera, e a Anthropic não tem o serviço. E o modelo de
-- embedding se escolhe por dimensão e preço, não por qualidade de escrita.
--
-- Vazio significa "sem busca semântica": a busca lexical (trigrama) continua
-- atendendo sozinha, e é isso que faz a funcionalidade degradar em vez de
-- quebrar quando ninguém configurou nada.

ALTER TABLE "agente_config" ADD COLUMN "embeddingBaseUrl" TEXT;
ALTER TABLE "agente_config" ADD COLUMN "embeddingModelo" TEXT;
-- AES-256-GCM, como a chave do chat: precisa ser reversível para chamar o
-- provedor. A chave em claro nunca sai da API.
ALTER TABLE "agente_config" ADD COLUMN "embeddingApiKeyCifrada" TEXT;
ALTER TABLE "agente_config" ADD COLUMN "embeddingApiKeyUltimos4" TEXT;

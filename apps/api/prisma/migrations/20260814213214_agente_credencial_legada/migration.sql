-- Move a chave gravada na coluna antiga de `agente_config` para a tabela de
-- credenciais por provedor, marcando-a com o provedor a que ela realmente
-- pertence.
--
-- Sem isto, a leitura precisava de um fallback para a coluna antiga — e esse
-- fallback não tinha como saber de qual provedor a chave era: comparava com o
-- provedor ATIVO, que muda justamente ao trocar de provedor. Resultado: depois
-- de trocar para a Anthropic, a chave da Groq era enviada para a Anthropic.
INSERT INTO "agente_credenciais" ("id", "empresaId", "provedor", "apiKeyCifrada", "apiKeyUltimos4", "modelo", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  c."empresaId",
  c."provedor",
  c."apiKeyCifrada",
  COALESCE(c."apiKeyUltimos4", '????'),
  c."modelo",
  now(),
  now()
FROM "agente_config" c
WHERE c."apiKeyCifrada" IS NOT NULL
ON CONFLICT ("empresaId", "provedor") DO NOTHING;

-- Coluna legada zerada: a partir daqui a chave vive só na tabela por provedor.
UPDATE "agente_config" SET "apiKeyCifrada" = NULL, "apiKeyUltimos4" = NULL;

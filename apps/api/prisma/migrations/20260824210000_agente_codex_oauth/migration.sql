-- Provedor `codex`: autentica pelo login OAuth da assinatura ChatGPT, não por
-- chave de API. As duas colunas de chave passam a aceitar NULL, e entram as
-- colunas do par de tokens.
--
-- `agente_credenciais` já tem RLS e a policy tenant_isolation_agente_credenciais
-- (migration 20260814212447_agente_multi_provedor). ALTER TABLE não a afeta —
-- nenhuma policy nova é necessária aqui.

ALTER TABLE "agente_credenciais" ALTER COLUMN "apiKeyCifrada" DROP NOT NULL;
ALTER TABLE "agente_credenciais" ALTER COLUMN "apiKeyUltimos4" DROP NOT NULL;

ALTER TABLE "agente_credenciais" ADD COLUMN "accessTokenCifrado" TEXT;
ALTER TABLE "agente_credenciais" ADD COLUMN "refreshTokenCifrado" TEXT;
ALTER TABLE "agente_credenciais" ADD COLUMN "contaId" TEXT;
ALTER TABLE "agente_credenciais" ADD COLUMN "contaEmail" TEXT;
ALTER TABLE "agente_credenciais" ADD COLUMN "tokenExpiraEm" TIMESTAMP(3);

-- Os provedores `xai` e `groq` saíram da tela. As credenciais deles não têm
-- mais como ser usadas nem exibidas (o enum dos contratos não os aceita), então
-- ficariam como chave de terceiro parada no banco — apagar é o correto.
DELETE FROM "agente_credenciais" WHERE "provedor" IN ('xai', 'groq');

-- Empresa que estava usando um deles cai para o Claude, com a baseUrl e o
-- modelo padrão dele; sem isso a configuração ficaria apontando para um
-- provedor que não existe mais e o agente responderia erro na primeira pergunta.
UPDATE "agente_config"
   SET "provedor" = 'anthropic',
       "baseUrl"  = 'https://api.anthropic.com',
       "modelo"   = 'claude-opus-5'
 WHERE "provedor" IN ('xai', 'groq');

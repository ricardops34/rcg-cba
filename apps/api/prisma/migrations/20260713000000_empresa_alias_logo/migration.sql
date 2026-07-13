-- Branding por empresa: alias (slug para a URL de login) e logo.
--
-- `alias` é usado na tela de login (?empresa=<alias>) para exibir a marca da
-- empresa e direcionar o login para ela. Único, opcional (empresas antigas
-- ficam nulas até o admin preencher). `logoUrl` guarda o caminho relativo do
-- arquivo enviado (ex.: /uploads/logos/<arquivo>).
--
-- A tabela "empresas" não tem RLS (não possui empresaId de negócio), então
-- estas colunas não exigem policy — o lookup público por alias no login roda
-- sem contexto de tenant.

ALTER TABLE "empresas" ADD COLUMN "alias" TEXT;
ALTER TABLE "empresas" ADD COLUMN "logoUrl" TEXT;

CREATE UNIQUE INDEX "empresas_alias_key" ON "empresas"("alias");

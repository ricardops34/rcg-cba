-- Dados do usuário saem do vínculo (decisão de 30/09/2026).
--
-- "Não temos usuário por empresa, temos o usuário vinculado ao grupo
-- econômico": uma conta pertence a um grupo só, e perfil, superior e dados da
-- pessoa valem em todas as empresas dele. Até aqui moravam em cada linha de
-- usuario_empresas, e a API os replicava entre as empresas do grupo.
--
-- usuario_empresas passa a dizer só a quais empresas o usuário tem acesso (e a
-- tela inicial dele em cada uma). As colunas antigas ficam, sem uso e sem
-- NOT NULL, até a migration que as apaga — volta possível se algo der errado.
--
-- Roda com a role dona (plataforma), que não é afetada pela RLS.

-- 1. Colunas novas.
ALTER TABLE "usuarios"
  ADD COLUMN "perfilId" TEXT,
  ADD COLUMN "superiorId" TEXT,
  ADD COLUMN "codigoErp" TEXT,
  ADD COLUMN "nomeReduzido" TEXT,
  ADD COLUMN "telefone" TEXT,
  ADD COLUMN "celular" TEXT,
  ADD COLUMN "dataNascimento" TIMESTAMP(3);

-- 2. Preenche a partir do vínculo de referência de cada usuário: o ativo e não
--    excluído mais antigo (o mesmo desempate do AuthService para a empresa
--    inicial). Os vínculos ativos do grupo já estavam iguais — a API os
--    sincronizava —; os inativos podiam divergir e perdem.
WITH referencia AS (
  SELECT DISTINCT ON (ue."usuarioId")
    ue."usuarioId", ue."perfilId", ue."superiorId", ue."codigoErp", ue."nomeReduzido",
    ue."telefone", ue."celular", ue."dataNascimento"
  FROM "usuario_empresas" ue
  ORDER BY ue."usuarioId",
           ue."ativo" DESC,
           (ue."deletedAt" IS NULL) DESC,
           ue."createdAt" ASC
)
UPDATE "usuarios" u
SET "perfilId"       = r."perfilId",
    -- superior era o vínculo do superior; passa a ser o usuário dele
    "superiorId"     = (SELECT s."usuarioId" FROM "usuario_empresas" s WHERE s."id" = r."superiorId"),
    "codigoErp"      = r."codigoErp",
    "nomeReduzido"   = r."nomeReduzido",
    "telefone"       = r."telefone",
    "celular"        = r."celular",
    "dataNascimento" = r."dataNascimento"
FROM referencia r
WHERE r."usuarioId" = u."id";

-- Superior de si mesmo não tem sentido (vínculo apontando para outro vínculo
-- do mesmo usuário, em outra empresa).
UPDATE "usuarios" SET "superiorId" = NULL WHERE "superiorId" = "id";

-- 3. Todo usuário tem perfil. Falha alto se sobrar conta sem vínculo nenhum —
--    melhor do que criar um usuário sem acesso definido.
ALTER TABLE "usuarios" ALTER COLUMN "perfilId" SET NOT NULL;

ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_perfilId_fkey"
  FOREIGN KEY ("perfilId") REFERENCES "perfis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_superiorId_fkey"
  FOREIGN KEY ("superiorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "usuarios_perfilId_idx" ON "usuarios"("perfilId");
CREATE INDEX "usuarios_superiorId_idx" ON "usuarios"("superiorId");

-- 4. As colunas antigas do vínculo deixam de ser obrigatórias (o código não as
--    grava mais).
ALTER TABLE "usuario_empresas" ALTER COLUMN "perfilId" DROP NOT NULL;

-- 5. A policy de leitura de perfis lia o perfil do usuário pelo vínculo.
DROP POLICY perfis_leitura ON "perfis";
CREATE POLICY perfis_leitura ON "perfis" FOR SELECT USING (
  "grupoEconomicoId" IS NULL
  OR app_modo_plataforma()
  OR "grupoEconomicoId" = app_grupo_atual()
  OR EXISTS (
    SELECT 1 FROM "usuarios" u
    WHERE u."perfilId" = "perfis"."id"
      AND u."id" = current_setting('app.current_usuario_id', true)
  )
);

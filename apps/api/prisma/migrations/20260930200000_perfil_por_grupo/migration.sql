-- Perfil passa a ter dono: a plataforma (grupoEconomicoId nulo) ou um grupo
-- econômico. O administrador de uma empresa do grupo altera os perfis do grupo;
-- os da plataforma continuam só com o administrador da plataforma, porque
-- valem para todos os clientes.
--
-- 1. Coluna e FK.
-- 2. Nome único por dono: (grupo, nome) para os do grupo e um índice parcial
--    para os da plataforma (no Postgres, nulos não colidem em índice único).
-- 3. Cada grupo recebe uma cópia, com as permissões, de cada perfil da
--    plataforma que ele já usa (vínculo de usuário, ferramenta do agente ou
--    comunicado), e esses usos passam para a cópia. Sem isso o administrador
--    da empresa não teria o que editar: os usuários dele estão todos em perfis
--    da plataforma. Ficam na plataforma os perfis de sistema (sistemaBase e
--    administraPlataforma), que o código procura e concede por conta própria.
--
-- Roda com a role dona (plataforma), que não é afetada pela RLS de
-- usuario_empresas, agente_ferramenta_perfis e comunicado_perfis (sem FORCE
-- ROW LEVEL SECURITY).

-- 1.
ALTER TABLE "perfis" ADD COLUMN "grupoEconomicoId" TEXT;

ALTER TABLE "perfis" ADD CONSTRAINT "perfis_grupoEconomicoId_fkey"
  FOREIGN KEY ("grupoEconomicoId") REFERENCES "grupos_economicos"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2.
DROP INDEX "perfis_nome_key";

CREATE UNIQUE INDEX "perfis_grupoEconomicoId_nome_key" ON "perfis"("grupoEconomicoId", "nome");

CREATE UNIQUE INDEX "perfis_nome_plataforma_key" ON "perfis"("nome")
  WHERE "grupoEconomicoId" IS NULL;

-- 3.
CREATE TEMP TABLE "_perfil_copia" ON COMMIT DROP AS
SELECT u."grupo", u."origem", gen_random_uuid()::text AS "novo"
FROM (
  SELECT DISTINCT e."grupoEconomicoId" AS "grupo", x."perfilId" AS "origem"
  FROM (
    SELECT "empresaId", "perfilId" FROM "usuario_empresas"
    UNION SELECT "empresaId", "perfilId" FROM "agente_ferramenta_perfis"
    UNION SELECT "empresaId", "perfilId" FROM "comunicado_perfis"
  ) x
  JOIN "empresas" e ON e."id" = x."empresaId"
  JOIN "perfis" p ON p."id" = x."perfilId"
  WHERE e."grupoEconomicoId" IS NOT NULL
    AND p."grupoEconomicoId" IS NULL
    AND p."sistemaBase" = false
    AND p."administraPlataforma" = false
    AND p."deletedAt" IS NULL
    -- O grupo da empresa dona da plataforma (onde está quem tem o perfil
    -- "Administrador da Plataforma", hoje a B. J. Informática) não recebe
    -- cópias: os perfis dela são os da plataforma. Copiar faria o administrador
    -- da plataforma editar a cópia do grupo achando que editava o modelo.
    AND NOT EXISTS (
      SELECT 1
      FROM "usuario_empresas" adm
      JOIN "perfis" pa ON pa."id" = adm."perfilId" AND pa."administraPlataforma" = true
      JOIN "empresas" ea ON ea."id" = adm."empresaId"
      WHERE ea."grupoEconomicoId" = e."grupoEconomicoId"
    )
) u;

INSERT INTO "perfis" (
  "id", "nome", "descricao", "sistemaBase", "administraPlataforma", "ativo",
  "rotinaInicialId", "grupoEconomicoId", "createdAt", "updatedAt", "createdBy", "updatedBy"
)
SELECT c."novo", p."nome", p."descricao", false, false, p."ativo",
       p."rotinaInicialId", c."grupo", now(), now(), p."createdBy", p."updatedBy"
FROM "_perfil_copia" c
JOIN "perfis" p ON p."id" = c."origem";

INSERT INTO "perfil_permissoes" (
  "id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt", "createdBy", "updatedBy"
)
SELECT gen_random_uuid()::text, c."novo", pp."rotinaId", pp."acao", pp."permitido",
       now(), now(), pp."createdBy", pp."updatedBy"
FROM "_perfil_copia" c
JOIN "perfil_permissoes" pp ON pp."perfilId" = c."origem";

UPDATE "usuario_empresas" ue
SET "perfilId" = c."novo"
FROM "_perfil_copia" c, "empresas" e
WHERE e."id" = ue."empresaId"
  AND e."grupoEconomicoId" = c."grupo"
  AND ue."perfilId" = c."origem";

UPDATE "agente_ferramenta_perfis" af
SET "perfilId" = c."novo"
FROM "_perfil_copia" c, "empresas" e
WHERE e."id" = af."empresaId"
  AND e."grupoEconomicoId" = c."grupo"
  AND af."perfilId" = c."origem";

UPDATE "comunicado_perfis" cp
SET "perfilId" = c."novo"
FROM "_perfil_copia" c, "empresas" e
WHERE e."id" = cp."empresaId"
  AND e."grupoEconomicoId" = c."grupo"
  AND cp."perfilId" = c."origem";

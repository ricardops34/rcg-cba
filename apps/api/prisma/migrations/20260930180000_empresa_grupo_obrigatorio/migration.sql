-- Toda empresa tem grupo econômico (hierarquia Grupo econômico → Empresa,
-- decisão do usuário em 30/09/2026).
--
-- 1. Empresa que ainda está sem grupo ganha um, com o nome dela. A Plataforma
--    pode renomeá-lo ou juntar a empresa a outro grupo depois.
-- 2. Os usuários com vínculo ATIVO nessas empresas, e ainda sem grupo, passam a
--    pertencer ao grupo novo. Vínculo inativo é histórico, não pertença.
-- 3. A coluna passa a ser obrigatória.
--
-- Roda com a role dona (plataforma). usuario_empresas tem RLS, mas a dona das
-- tabelas não é afetada por ela (sem FORCE ROW LEVEL SECURITY).

DO $$
DECLARE
  e record;
  novo text;
BEGIN
  FOR e IN SELECT "id", "nomeFantasia" FROM "empresas" WHERE "grupoEconomicoId" IS NULL LOOP
    novo := gen_random_uuid()::text;
    INSERT INTO "grupos_economicos" ("id", "descricao", "createdAt", "updatedAt")
    VALUES (novo, e."nomeFantasia", now(), now());
    UPDATE "empresas" SET "grupoEconomicoId" = novo WHERE "id" = e."id";
    UPDATE "usuarios" u SET "grupoEconomicoId" = novo
    WHERE u."grupoEconomicoId" IS NULL
      AND EXISTS (
        SELECT 1 FROM "usuario_empresas" ue
        WHERE ue."usuarioId" = u."id" AND ue."empresaId" = e."id" AND ue."ativo" = true
      );
  END LOOP;
END
$$;

ALTER TABLE "empresas" ALTER COLUMN "grupoEconomicoId" SET NOT NULL;

-- Com a coluna obrigatória, "ON DELETE SET NULL" não faz mais sentido: grupo
-- que tem empresas não pode ser apagado (a Plataforma desativa o grupo vazio).
ALTER TABLE "empresas" DROP CONSTRAINT "empresas_grupoEconomicoId_fkey";
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_grupoEconomicoId_fkey"
  FOREIGN KEY ("grupoEconomicoId") REFERENCES "grupos_economicos"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

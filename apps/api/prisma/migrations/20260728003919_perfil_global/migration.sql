-- Perfil deixa de ser por empresa e vira global (compartilhado por todas as
-- empresas), mesmo precedente de modulos/menus/rotinas. Antes de remover a
-- coluna empresaId, consolida os registros duplicados (mesmo nome, um por
-- empresa) em um único registro canônico por nome — hoje na prática todos os
-- perfis com o mesmo nome já têm exatamente as mesmas permissões (seed usa a
-- mesma lógica para as 3 empresas), então não há conflito de dados a
-- reconciliar; se isso não for verdade em uma base com dados reais
-- divergentes, audite antes de aplicar esta migration.

-- Escolhe o registro de menor id como canônico para cada nome de perfil.
WITH canonical AS (
  SELECT DISTINCT ON (nome) id, nome FROM "perfis" ORDER BY nome, id
)
UPDATE "usuario_empresas" ue
SET "perfilId" = c.id
FROM "perfis" p
JOIN canonical c ON c.nome = p.nome
WHERE ue."perfilId" = p.id AND p.id <> c.id;

-- Remove as permissões dos perfis duplicados (o canônico já tem o mesmo
-- conjunto, gerado pela mesma lógica de seed).
WITH canonical AS (
  SELECT DISTINCT ON (nome) id, nome FROM "perfis" ORDER BY nome, id
)
DELETE FROM "perfil_permissoes" pp
USING "perfis" p
JOIN canonical c ON c.nome = p.nome
WHERE pp."perfilId" = p.id AND p.id <> c.id;

-- Remove os perfis duplicados, mantendo só o canônico de cada nome.
WITH canonical AS (
  SELECT DISTINCT ON (nome) id, nome FROM "perfis" ORDER BY nome, id
)
DELETE FROM "perfis" p
USING canonical c
WHERE p.nome = c.nome AND p.id <> c.id;

-- Row-Level Security: perfis vira referência global (sem empresaId), sai da
-- lista de tabelas com RLS — mesmo padrão de modulos/menus/rotinas. Precisa
-- vir ANTES de dropar a coluna empresaId: a policy depende dela.
DROP POLICY IF EXISTS tenant_isolation_perfis ON "perfis";
ALTER TABLE "perfis" DISABLE ROW LEVEL SECURITY;

-- DropForeignKey
ALTER TABLE "perfis" DROP CONSTRAINT "perfis_empresaId_fkey";

-- DropIndex
DROP INDEX "perfis_empresaId_nome_key";

-- AlterTable
ALTER TABLE "perfis" DROP COLUMN "empresaId";

-- CreateIndex
CREATE UNIQUE INDEX "perfis_nome_key" ON "perfis"("nome");

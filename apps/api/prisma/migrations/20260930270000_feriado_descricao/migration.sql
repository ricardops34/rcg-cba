-- O schema passou a chamar o nome do feriado de `descricao` (commit
-- 8c464b7, 30/09/2026), sem migration: o banco seguia com `nome`, e qualquer
-- leitura pelo Prisma quebrava ("column feriados.descricao does not exist").
-- A tabela ainda não tinha uso nem dados; o rename só alinha banco e schema.
ALTER TABLE "feriados" RENAME COLUMN "nome" TO "descricao";

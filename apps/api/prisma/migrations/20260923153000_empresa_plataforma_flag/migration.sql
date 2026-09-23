-- Identifica a empresa gestora da plataforma. O schema e o AuthService já
-- consultavam este campo durante o login, mas ele ainda não existia no banco;
-- por isso qualquer autenticação falhava com Prisma P2022.
--
-- `empresas` já possui RLS. Esta migration apenas acrescenta uma coluna à
-- tabela existente, portanto não cria nem altera policies de isolamento.
ALTER TABLE "empresas"
  ADD COLUMN IF NOT EXISTS "ePlataforma" BOOLEAN NOT NULL DEFAULT false;

-- Instalações existentes usam a BJSoftware como empresa gestora. O alias é o
-- identificador estável; o nome cobre bases antigas que ainda não tinham alias.
UPDATE "empresas"
SET "ePlataforma" = true
WHERE "alias" = 'bjs'
   OR lower("nomeFantasia") = 'bjsoftware';

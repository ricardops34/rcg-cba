-- A conta e o primeiro acesso são globais; usuarios não possui empresaId.
-- Telefone e nascimento continuam no vínculo existente, protegido por RLS.
ALTER TABLE "usuarios" ADD COLUMN "primeiroAcessoConcluidoEm" TIMESTAMP(3);

-- Preserva quem já usava a plataforma. Contas sem login e novas contas
-- devem confirmar os dados após aceitar os termos.
UPDATE "usuarios"
SET "primeiroAcessoConcluidoEm" = "ultimoLogin"
WHERE "ultimoLogin" IS NOT NULL;

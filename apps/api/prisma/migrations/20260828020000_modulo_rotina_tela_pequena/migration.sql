-- Módulos e rotinas são catálogo global, sem empresaId e sem dados de negócio.
-- Por isso estas tabelas não recebem RLS (ver migrations/README.md).
ALTER TABLE "modulos"
  ADD COLUMN "disponivelTelaPequena" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "rotinas"
  ADD COLUMN "disponivelTelaPequena" BOOLEAN NOT NULL DEFAULT true;

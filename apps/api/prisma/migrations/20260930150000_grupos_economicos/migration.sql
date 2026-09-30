-- Catálogo estrutural de tenants, como empresas: sem empresaId e sem RLS.
-- O service exige administração de uma empresa do grupo. Incluir empresas
-- exige administração prévia de cada empresa, ou autoridade de plataforma.
CREATE TABLE "grupos_economicos" (
  "id" TEXT PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "deletedAt" TIMESTAMP(3)
);
ALTER TABLE "empresas" ADD COLUMN "grupoEconomicoId" TEXT;
CREATE INDEX "empresas_grupoEconomicoId_idx" ON "empresas"("grupoEconomicoId");
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_grupoEconomicoId_fkey"
  FOREIGN KEY ("grupoEconomicoId") REFERENCES "grupos_economicos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "usuarios" ADD COLUMN "grupoEconomicoId" TEXT;
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_grupoEconomicoId_fkey"
  FOREIGN KEY ("grupoEconomicoId") REFERENCES "grupos_economicos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

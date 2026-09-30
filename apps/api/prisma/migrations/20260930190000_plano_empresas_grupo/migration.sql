ALTER TABLE "planos" ADD COLUMN "limiteEmpresas" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "planos" ADD CONSTRAINT "planos_limiteEmpresas_check" CHECK ("limiteEmpresas" >= 1);
-- Catálogo global de cobrança já existente. Assinaturas excedentes por empresa
-- permanecem como histórico (grupoEconomicoId nulo), sem duplicar o contrato.
ALTER TABLE "assinaturas" ALTER COLUMN "empresaId" DROP NOT NULL;
ALTER TABLE "assinaturas" ADD COLUMN "grupoEconomicoId" TEXT;
CREATE UNIQUE INDEX "assinaturas_grupoEconomicoId_key" ON "assinaturas"("grupoEconomicoId");
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_grupoEconomicoId_fkey"
  FOREIGN KEY ("grupoEconomicoId") REFERENCES "grupos_economicos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Prioriza contrato ativo, depois teste e por fim o mais antigo. Não altera
-- valor, plano ou situação. Contratos anteriores permanecem íntegros na tabela.
WITH candidatos AS (
  SELECT a.id, e."grupoEconomicoId",
    row_number() OVER (PARTITION BY e."grupoEconomicoId" ORDER BY
      CASE a.situacao WHEN 'ativa' THEN 0 WHEN 'teste' THEN 1 ELSE 2 END,
      a."createdAt", a.id) AS ordem
  FROM assinaturas a JOIN empresas e ON e.id = a."empresaId"
  WHERE e."deletedAt" IS NULL
)
UPDATE assinaturas a SET "grupoEconomicoId" = c."grupoEconomicoId"
FROM candidatos c WHERE a.id = c.id AND c.ordem = 1;

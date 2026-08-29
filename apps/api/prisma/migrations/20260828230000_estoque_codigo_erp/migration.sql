ALTER TABLE "estoques" ADD COLUMN "codigoErp" TEXT;

UPDATE "estoques"
   SET "codigoErp" = 'MIGRACAO-' || "id"
 WHERE "codigoErp" IS NULL;

ALTER TABLE "estoques" ALTER COLUMN "codigoErp" SET NOT NULL;

CREATE UNIQUE INDEX "estoques_empresaId_codigoErp_key"
    ON "estoques"("empresaId", "codigoErp");

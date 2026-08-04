-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN "dataRetorno" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "atividades" ADD COLUMN "orcamentoId" TEXT;

-- CreateIndex
CREATE INDEX "atividades_empresaId_orcamentoId_idx" ON "atividades"("empresaId", "orcamentoId");

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "orcamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

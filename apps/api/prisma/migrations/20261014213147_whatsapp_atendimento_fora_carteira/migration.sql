-- AlterTable
ALTER TABLE "vendedores" ADD COLUMN     "atendeOutrasCarteiras" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "usarNomeWhatsapp" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "atividades" ADD COLUMN     "vendedorAtendimentoId" TEXT;

-- CreateIndex
CREATE INDEX "atividades_empresaId_vendedorAtendimentoId_idx" ON "atividades"("empresaId", "vendedorAtendimentoId");

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_vendedorAtendimentoId_fkey" FOREIGN KEY ("vendedorAtendimentoId") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

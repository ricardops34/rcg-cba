-- AlterTable
ALTER TABLE "clientes" ADD COLUMN "tabelaPrecoId" TEXT;

-- CreateIndex
CREATE INDEX "clientes_empresaId_tabelaPrecoId_idx" ON "clientes"("empresaId", "tabelaPrecoId");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tabelaPrecoId_fkey" FOREIGN KEY ("tabelaPrecoId") REFERENCES "tabelas_preco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

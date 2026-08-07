-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "condicaoPagamentoId" TEXT;

-- CreateIndex
CREATE INDEX "clientes_empresaId_condicaoPagamentoId_idx" ON "clientes"("empresaId", "condicaoPagamentoId");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_condicaoPagamentoId_fkey" FOREIGN KEY ("condicaoPagamentoId") REFERENCES "condicoes_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vínculo com a regra de desconto (SZ0) nos pontos onde ela pode ser
-- definida ou registrada: categoria e produto (cadastro), item de tabela de
-- preço (preço específico), item de nota de saída e item de orçamento
-- (o que foi de fato aplicado na linha).
--
-- Todos nullable e nascem vazios: a resolução de qual regra vale para cada
-- item ainda não está implementada. ON DELETE SET NULL — excluir uma regra
-- solta os vínculos em vez de travar a exclusão.

-- AlterTable
ALTER TABLE "categorias" ADD COLUMN     "regraDescontoId" TEXT;

-- AlterTable
ALTER TABLE "notas_saida_itens" ADD COLUMN     "regraDescontoId" TEXT;

-- AlterTable
ALTER TABLE "orcamento_itens" ADD COLUMN     "regraDescontoId" TEXT;

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "regraDescontoId" TEXT;

-- AlterTable
ALTER TABLE "tabela_preco_itens" ADD COLUMN     "regraDescontoId" TEXT;

-- CreateIndex
CREATE INDEX "categorias_empresaId_regraDescontoId_idx" ON "categorias"("empresaId", "regraDescontoId");

-- CreateIndex
CREATE INDEX "notas_saida_itens_empresaId_regraDescontoId_idx" ON "notas_saida_itens"("empresaId", "regraDescontoId");

-- CreateIndex
CREATE INDEX "orcamento_itens_empresaId_regraDescontoId_idx" ON "orcamento_itens"("empresaId", "regraDescontoId");

-- CreateIndex
CREATE INDEX "produtos_empresaId_regraDescontoId_idx" ON "produtos"("empresaId", "regraDescontoId");

-- CreateIndex
CREATE INDEX "tabela_preco_itens_empresaId_regraDescontoId_idx" ON "tabela_preco_itens"("empresaId", "regraDescontoId");

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_regraDescontoId_fkey" FOREIGN KEY ("regraDescontoId") REFERENCES "regras_desconto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_regraDescontoId_fkey" FOREIGN KEY ("regraDescontoId") REFERENCES "regras_desconto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabela_preco_itens" ADD CONSTRAINT "tabela_preco_itens_regraDescontoId_fkey" FOREIGN KEY ("regraDescontoId") REFERENCES "regras_desconto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida_itens" ADD CONSTRAINT "notas_saida_itens_regraDescontoId_fkey" FOREIGN KEY ("regraDescontoId") REFERENCES "regras_desconto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_regraDescontoId_fkey" FOREIGN KEY ("regraDescontoId") REFERENCES "regras_desconto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

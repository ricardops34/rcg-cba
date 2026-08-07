-- Percentual de comissão do vendedor. Mantido pelo ERP via API de integração
-- e somente leitura na tela, como os demais campos de comissão/regra de
-- desconto. Nasce vazio: nulo = não informado (diferente de 0%).

-- AlterTable
ALTER TABLE "vendedores" ADD COLUMN     "percComissao" DOUBLE PRECISION;

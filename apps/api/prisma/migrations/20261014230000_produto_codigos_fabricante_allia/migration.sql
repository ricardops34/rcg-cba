-- Produto: código e descrição no fabricante (B1_XCOD, B1_XXDESC) e código
-- Allia (B1_XALLIA), enviados pelo BJPLA003. Os antigos "codigoFabricante" e
-- "descricaoFabricante" continuam com B1_XFOR e B1_XDESFOR (do fornecedor).
ALTER TABLE "produtos" ADD COLUMN "codigoNoFabricante" TEXT;
ALTER TABLE "produtos" ADD COLUMN "descricaoNoFabricante" TEXT;
ALTER TABLE "produtos" ADD COLUMN "codigoAllia" TEXT;

-- Alíquotas de IPI e ICMS do item da nota de entrada (D1_IPI, D1_PICM), para
-- o relatório de Compras. Até aqui só havia os valores; calcular a alíquota
-- por eles erra com base reduzida e ST. Nulas até a integração mandar.
ALTER TABLE "notas_entrada_itens" ADD COLUMN "aliqIpi" DOUBLE PRECISION;
ALTER TABLE "notas_entrada_itens" ADD COLUMN "aliqIcms" DOUBLE PRECISION;

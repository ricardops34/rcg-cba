-- Percentual de comissão apurado por linha, onde a venda acontece: item de
-- nota de saída e item de orçamento. É o resultado da regra de desconto
-- (comissão cheia × base da faixa em que o desconto caiu).
--
-- Nullable e nasce vazio — o cálculo ainda não existe; nulo distingue "não
-- apurado" de "apurado como zero" (regra sem comissão).

-- AlterTable
ALTER TABLE "notas_saida_itens" ADD COLUMN     "percComissao" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "orcamento_itens" ADD COLUMN     "percComissao" DOUBLE PRECISION;

-- Acréscimo financeiro e valor mínimo da condição de pagamento, direto do ERP
-- (decisão do usuário, 2026-11-19). No Protheus (SE4): `% Acres.Fin.` é
-- E4_ACRSFIN, `Lim.Inferior` (valor mínimo de venda usado pela condição) é
-- E4_INFER. Nascem nulas; a carga do ERP passa a preenchê-las.
ALTER TABLE "condicoes_pagamento" ADD COLUMN "acrescimoFinanceiro" DOUBLE PRECISION;
ALTER TABLE "condicoes_pagamento" ADD COLUMN "valorMinimo" DOUBLE PRECISION;

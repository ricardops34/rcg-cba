-- Acerta os nomes conforme o dicionário de campos da SZ0 (SX3):
--   Z0_DESCAUT — "% Desc. Aut"  → percDescontoAutorizado
--   Z0_PERMAX  — "% Desc Max"   → percDescontoMaximo
-- Os valores já estavam nas colunas certas (cada uma recebeu a coluna
-- correspondente do ERP); só os nomes estavam invertidos. RENAME preserva os
-- dados — nenhuma regra precisa ser recadastrada.

ALTER TABLE "regras_desconto" RENAME COLUMN "descontoMaximo" TO "percDescontoAutorizado";
ALTER TABLE "regras_desconto" RENAME COLUMN "percMaximoPermitido" TO "percDescontoMaximo";

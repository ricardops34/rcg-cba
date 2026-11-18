-- Nota de saida que o item de entrada devolve (D1_NFORI, D1_SERIORI,
-- D1_ITEMORI): liga o retorno de comodato a remessa. Sem RLS nova: a tabela ja
-- tem a policy.
ALTER TABLE "notas_entrada_itens"
  ADD COLUMN "notaOrigem" TEXT,
  ADD COLUMN "serieOrigem" TEXT,
  ADD COLUMN "itemOrigem" INTEGER;

CREATE INDEX "notas_entrada_itens_empresaId_clienteId_notaOrigem_idx"
  ON "notas_entrada_itens" ("empresaId", "clienteId", "notaOrigem");

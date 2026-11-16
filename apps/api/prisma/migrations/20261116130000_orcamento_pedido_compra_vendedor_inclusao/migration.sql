-- Ordem/pedido de compra do cliente e vendedor que incluiu o orçamento em
-- carteira alheia (decisão do usuário, 2026-11-16). Vão para o pedido no ERP:
-- C6_PEDCLI + texto no C5_XOBSVEN, e C5_XVDMAX. Colunas novas em tabela que já
-- tem RLS: a policy existente cobre.
ALTER TABLE "orcamentos" ADD COLUMN "pedidoCompraCliente" VARCHAR(9);
ALTER TABLE "orcamentos" ADD COLUMN "vendedorInclusaoId" TEXT;

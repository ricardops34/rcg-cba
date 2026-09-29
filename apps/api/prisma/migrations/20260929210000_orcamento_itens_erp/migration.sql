-- Itens do pedido como o ERP mandou por ultimo (PUT/POST /integracao/pedidos).
-- A tela compara com os itens do orcamento para apontar as diferencas:
-- quantidade, preco, quanto ja foi faturado e o saldo. Ver
-- docs/planos/2026-09-28-orcamento-situacao-erp.md.
ALTER TABLE "orcamentos" ADD COLUMN "itensErp" JSONB;

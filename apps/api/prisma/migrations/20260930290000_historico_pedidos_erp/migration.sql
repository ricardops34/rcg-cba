-- Histórico de pedidos do ERP (docs/planos/2026-09-30-historico-pedidos-erp.md):
-- pedido digitado direto no ERP entra como orçamento de origem "erp", sem
-- número de proposta — mostra o nº do pedido (codigoErp). O unique
-- (empresaId, numero) continua: nulos não colidem.
ALTER TYPE "OrigemVenda" ADD VALUE IF NOT EXISTS 'erp';

ALTER TABLE "orcamentos" ALTER COLUMN "numero" DROP NOT NULL;

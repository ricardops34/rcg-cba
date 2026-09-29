-- Situacao do orcamento conforme o pedido no ERP. Ver
-- docs/planos/2026-09-28-orcamento-situacao-erp.md.
--
-- Tudo aqui e gravado so pela integracao: PUT /integracao/pedidos (situacao,
-- quebra e notas) e PATCH /integracao/orcamentos/pendentes/{id}/erro (recusa
-- do pedido no ERP). Nenhuma tabela nova: os campos ficam no proprio
-- orcamento, que ja tem RLS.
CREATE TYPE "SituacaoErpOrcamento" AS ENUM (
  'pendente',
  'liberado',
  'bloqueado_credito',
  'bloqueado_estoque',
  'bloqueado_desconto',
  'faturado_parcial',
  'faturado',
  'cancelado'
);

ALTER TABLE "orcamentos"
  ADD COLUMN "situacaoErp"      "SituacaoErpOrcamento",
  ADD COLUMN "situacaoErpEm"    TIMESTAMP(3),
  ADD COLUMN "comQuebra"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "erroIntegracao"   TEXT,
  ADD COLUMN "erroIntegracaoEm" TIMESTAMP(3),
  ADD COLUMN "notasErp"         JSONB;

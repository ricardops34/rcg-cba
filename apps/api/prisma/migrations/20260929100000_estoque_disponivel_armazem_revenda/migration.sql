-- Estoque disponivel e armazens de revenda. Ver
-- docs/planos/2026-09-29-estoque-disponivel-armazens-revenda.md.
--
-- revenda: o ERP marca os armazens do MV_BJAPI16; so eles contam no estoque da
-- plataforma. Default true para nao zerar o estoque ate os armazens serem
-- reenviados.
ALTER TABLE "armazens" ADD COLUMN "revenda" BOOLEAN NOT NULL DEFAULT true;

-- disponivel: SaldoSB2() do Protheus. Nulo nas linhas enviadas antes desta
-- mudanca - o orcamento cai no saldo fisico.
ALTER TABLE "estoques" ADD COLUMN "disponivel" DOUBLE PRECISION;

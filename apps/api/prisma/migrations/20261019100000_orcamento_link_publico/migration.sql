-- Link público do orçamento: o cliente aprova ou recusa sem login.
ALTER TABLE "orcamentos"
  ADD COLUMN "clienteDecisaoCanal" TEXT,
  ADD COLUMN "clienteDecisaoIp" TEXT,
  ADD COLUMN "clienteDecisaoAgente" TEXT,
  ADD COLUMN "decididoPorUsuarioId" TEXT;

CREATE TABLE "orcamento_links" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "orcamentoId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiraEm" DATE,
  "revogadoEm" TIMESTAMP(3),
  "usadoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  CONSTRAINT "orcamento_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "orcamento_links_token_key" ON "orcamento_links"("token");
CREATE INDEX "orcamento_links_empresaId_orcamentoId_idx" ON "orcamento_links"("empresaId", "orcamentoId");

ALTER TABLE "orcamento_links" ADD CONSTRAINT "orcamento_links_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orcamento_links" ADD CONSTRAINT "orcamento_links_orcamentoId_fkey"
  FOREIGN KEY ("orcamentoId") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "orcamento_links" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_orcamento_links ON "orcamento_links"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

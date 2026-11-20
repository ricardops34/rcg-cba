-- Regiões de atuação dos vendedores (Gerencial > Vendedores > Regiões).
-- Decisão do usuário em 2026-11-20 (docs/planos/2026-11-20-mapas-clientes-rotas.md):
-- região desenhada (`area`) ou município inteiro (`municipio`, com a divisa do
-- IBGE em `geometria`); sem vendedor é região livre. Invasão = cliente da
-- carteira de um vendedor dentro da região de outro.
CREATE TABLE "vendedor_regioes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "vendedorId" TEXT,
    "tipo" TEXT NOT NULL,
    "municipioId" TEXT,
    "geometria" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "vendedor_regioes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vendedor_regioes_empresaId_vendedorId_idx" ON "vendedor_regioes"("empresaId", "vendedorId");

ALTER TABLE "vendedor_regioes" ADD CONSTRAINT "vendedor_regioes_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendedor_regioes" ADD CONSTRAINT "vendedor_regioes_vendedorId_fkey"
  FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vendedor_regioes" ADD CONSTRAINT "vendedor_regioes_municipioId_fkey"
  FOREIGN KEY ("municipioId") REFERENCES "municipios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "vendedor_regioes" TO plataforma_app;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "vendedor_regioes" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_vendedor_regioes ON "vendedor_regioes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

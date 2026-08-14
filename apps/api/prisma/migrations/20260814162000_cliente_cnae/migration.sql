-- CNAEs do cliente (principal + secundárias), apontando para a referência
-- `cnaes` — que hoje está vazia e passa a ser populada pelo sync do IBGE.
CREATE TABLE "cliente_cnaes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "cnaeId" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "cliente_cnaes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cliente_cnaes_empresaId_clienteId_idx" ON "cliente_cnaes"("empresaId", "clienteId");

CREATE INDEX "cliente_cnaes_empresaId_cnaeId_idx" ON "cliente_cnaes"("empresaId", "cnaeId");

CREATE UNIQUE INDEX "cliente_cnaes_clienteId_cnaeId_key" ON "cliente_cnaes"("clienteId", "cnaeId");

ALTER TABLE "cliente_cnaes" ADD CONSTRAINT "cliente_cnaes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cliente_cnaes" ADD CONSTRAINT "cliente_cnaes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cliente_cnaes" ADD CONSTRAINT "cliente_cnaes_cnaeId_fkey" FOREIGN KEY ("cnaeId") REFERENCES "cnaes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Chave natural do sync do IBGE e do casamento com o município devolvido por
-- MinhaReceita/ViaCEP. Os 5.509 municípios já importados têm código IBGE
-- distinto, então o índice sobe sem conflito; NULL não colide no Postgres.
CREATE UNIQUE INDEX "municipios_codigoIbge_key" ON "municipios"("codigoIbge");

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "cliente_cnaes" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_cliente_cnaes ON "cliente_cnaes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

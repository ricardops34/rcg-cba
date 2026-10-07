-- Baixa de comodato: saldo de equipamento num cliente que deixa de contar
-- (ver docs/planos/equipamentos-comodato.md).

-- CreateTable
CREATE TABLE "comodato_baixas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "desfeitaEm" TIMESTAMP(3),
    "desfeitaPor" TEXT,
    CONSTRAINT "comodato_baixas_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "comodato_baixas_empresaId_clienteId_produtoId_idx" ON "comodato_baixas"("empresaId", "clienteId", "produtoId");
-- AddForeignKey
ALTER TABLE "comodato_baixas" ADD CONSTRAINT "comodato_baixas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comodato_baixas" ADD CONSTRAINT "comodato_baixas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comodato_baixas" ADD CONSTRAINT "comodato_baixas_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "comodato_baixas" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_comodato_baixas ON "comodato_baixas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

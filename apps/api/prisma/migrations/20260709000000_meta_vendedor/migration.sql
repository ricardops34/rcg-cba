-- CreateTable
CREATE TABLE "meta_vendedor_mes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "valorObjetivo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metaClientes" INTEGER NOT NULL DEFAULT 0,
    "metaNovosClientes" INTEGER NOT NULL DEFAULT 0,
    "valorRealizado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clientesPositivados" INTEGER NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "meta_vendedor_mes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meta_vendedor_mes_empresaId_ano_mes_idx" ON "meta_vendedor_mes"("empresaId", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "meta_vendedor_mes_colaboradorId_ano_mes_key" ON "meta_vendedor_mes"("colaboradorId", "ano", "mes");

-- AddForeignKey
ALTER TABLE "meta_vendedor_mes" ADD CONSTRAINT "meta_vendedor_mes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_vendedor_mes" ADD CONSTRAINT "meta_vendedor_mes_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "meta_vendedor_mes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_meta_vendedor_mes ON "meta_vendedor_mes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

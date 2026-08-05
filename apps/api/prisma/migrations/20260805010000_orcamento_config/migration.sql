-- CreateTable
CREATE TABLE "orcamento_config" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "diasValidade" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "orcamento_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orcamento_config_empresaId_key" ON "orcamento_config"("empresaId");

-- AddForeignKey
ALTER TABLE "orcamento_config" ADD CONSTRAINT "orcamento_config_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "orcamento_config" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_orcamento_config ON "orcamento_config"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

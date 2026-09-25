-- CreateTable
CREATE TABLE "integracao_endpoint_configs" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "endpointKey" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoUso" TIMESTAMP(3),
    "totalChamadas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "integracao_endpoint_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integracao_endpoint_configs_empresaId_idx" ON "integracao_endpoint_configs"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "integracao_endpoint_configs_empresaId_endpointKey_key" ON "integracao_endpoint_configs"("empresaId", "endpointKey");

-- AddForeignKey
ALTER TABLE "integracao_endpoint_configs" ADD CONSTRAINT "integracao_endpoint_configs_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable Row Level Security (RLS)
ALTER TABLE "integracao_endpoint_configs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_integracao_endpoint_configs ON "integracao_endpoint_configs"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

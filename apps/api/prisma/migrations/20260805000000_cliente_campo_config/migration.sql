-- CreateTable
CREATE TABLE "cliente_campo_config" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "editavel" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "cliente_campo_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cliente_campo_config_empresaId_campo_key" ON "cliente_campo_config"("empresaId", "campo");

-- AddForeignKey
ALTER TABLE "cliente_campo_config" ADD CONSTRAINT "cliente_campo_config_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "cliente_campo_config" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_cliente_campo_config ON "cliente_campo_config"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

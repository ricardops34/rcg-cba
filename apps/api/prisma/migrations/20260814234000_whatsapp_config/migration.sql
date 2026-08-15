-- Configuração do WhatsApp por empresa (singleton), separada da sessão do
-- vendedor. Ver docs/planos/whatsapp-vendedor.md

-- CreateTable
CREATE TABLE "whatsapp_config" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "transporte" "WhatsappTransporte" NOT NULL DEFAULT 'zapo',
    "workerUrl" TEXT,
    "retencaoDias" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "whatsapp_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_config_empresaId_key" ON "whatsapp_config"("empresaId");

-- AddForeignKey
ALTER TABLE "whatsapp_config" ADD CONSTRAINT "whatsapp_config_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "whatsapp_config" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_whatsapp_config ON "whatsapp_config"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

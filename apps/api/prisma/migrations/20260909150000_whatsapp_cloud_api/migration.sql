-- AlterTable
ALTER TABLE "whatsapp_conversas" ADD COLUMN     "ultimaMensagemClienteEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "whatsapp_config" ADD COLUMN     "cloudApiAccessTokenCifrada" TEXT,
ADD COLUMN     "cloudApiAppSecretCifrada" TEXT,
ADD COLUMN     "cloudApiBusinessAccountId" TEXT,
ADD COLUMN     "cloudApiPhoneNumberId" TEXT,
ADD COLUMN     "cloudApiWebhookVerifyToken" TEXT;

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "metaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "idioma" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "componentes" JSONB NOT NULL,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_empresaId_metaId_key" ON "whatsapp_templates"("empresaId", "metaId");

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
ALTER TABLE "whatsapp_templates" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_whatsapp_templates ON "whatsapp_templates"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

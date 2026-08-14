
-- AlterTable
ALTER TABLE "agente_config" ALTER COLUMN "provedor" SET DEFAULT 'anthropic',
ALTER COLUMN "baseUrl" SET DEFAULT 'https://api.anthropic.com',
ALTER COLUMN "modelo" SET DEFAULT 'claude-opus-5';

-- CreateTable
CREATE TABLE "agente_credenciais" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "apiKeyCifrada" TEXT NOT NULL,
    "apiKeyUltimos4" TEXT NOT NULL,
    "modelo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "agente_credenciais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agente_credenciais_empresaId_provedor_key" ON "agente_credenciais"("empresaId", "provedor");

-- AddForeignKey
ALTER TABLE "agente_credenciais" ADD CONSTRAINT "agente_credenciais_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "agente_credenciais" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_agente_credenciais ON "agente_credenciais"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

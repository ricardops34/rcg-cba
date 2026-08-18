-- CreateEnum
CREATE TYPE "WhatsappLadoReacao" AS ENUM ('nos', 'contato');

-- CreateTable
CREATE TABLE "whatsapp_reacoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "deQuem" "WhatsappLadoReacao" NOT NULL,
    "reagiuPor" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_reacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_reacoes_empresaId_mensagemId_idx" ON "whatsapp_reacoes"("empresaId", "mensagemId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_reacoes_empresaId_mensagemId_deQuem_key" ON "whatsapp_reacoes"("empresaId", "mensagemId", "deQuem");

-- AddForeignKey
ALTER TABLE "whatsapp_reacoes" ADD CONSTRAINT "whatsapp_reacoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_reacoes" ADD CONSTRAINT "whatsapp_reacoes_mensagemId_fkey" FOREIGN KEY ("mensagemId") REFERENCES "whatsapp_mensagens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "whatsapp_reacoes" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_whatsapp_reacoes ON "whatsapp_reacoes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

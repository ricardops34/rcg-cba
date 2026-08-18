-- CreateEnum
CREATE TYPE "WhatsappAgendamentoStatus" AS ENUM ('pendente', 'enviando', 'enviada', 'erro', 'cancelada');

-- CreateTable
CREATE TABLE "whatsapp_mensagens_agendadas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "enviarEm" TIMESTAMP(3) NOT NULL,
    "status" "WhatsappAgendamentoStatus" NOT NULL DEFAULT 'pendente',
    "erro" TEXT,
    "mensagemId" TEXT,
    "criadaPor" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_mensagens_agendadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_mensagens_agendadas_status_enviarEm_idx" ON "whatsapp_mensagens_agendadas"("status", "enviarEm");

-- CreateIndex
CREATE INDEX "whatsapp_mensagens_agendadas_empresaId_conversaId_enviarEm_idx" ON "whatsapp_mensagens_agendadas"("empresaId", "conversaId", "enviarEm");

-- AddForeignKey
ALTER TABLE "whatsapp_mensagens_agendadas" ADD CONSTRAINT "whatsapp_mensagens_agendadas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_mensagens_agendadas" ADD CONSTRAINT "whatsapp_mensagens_agendadas_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "whatsapp_conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "whatsapp_mensagens_agendadas" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_whatsapp_mensagens_agendadas ON "whatsapp_mensagens_agendadas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

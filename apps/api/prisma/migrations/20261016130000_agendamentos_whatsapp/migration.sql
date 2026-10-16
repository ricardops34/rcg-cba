-- Agendamentos de WhatsApp na Agenda: a atividade aponta para a conversa e a
-- mensagem agendada aponta para a atividade. Ver docs/planos/2026-10-16-agendamentos-whatsapp.md.
-- Colunas novas em tabelas que já têm RLS; sem tabela nova.
ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'atendimento_agendado';

ALTER TABLE "atividades"
  ADD COLUMN "conversaId" TEXT,
  ADD COLUMN "iniciarConversa" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "automatica" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "atividades_empresaId_conversaId_idx" ON "atividades"("empresaId", "conversaId");

ALTER TABLE "whatsapp_mensagens_agendadas" ADD COLUMN "atividadeId" TEXT;

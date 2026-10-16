-- Marcador "Importante" em atividades (agenda, agendamentos) e em conversas de
-- WhatsApp. Colunas novas em tabelas que já têm RLS; sem tabela nova.
ALTER TABLE "atividades" ADD COLUMN "importante" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "whatsapp_conversas" ADD COLUMN "importante" BOOLEAN NOT NULL DEFAULT false;

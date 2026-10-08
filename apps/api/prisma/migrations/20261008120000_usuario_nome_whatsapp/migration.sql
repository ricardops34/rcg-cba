-- Nome que assina as mensagens de WhatsApp enviadas pela plataforma.
-- Coluna em tabela que já tem RLS (por grupo econômico): não há policy nova.
ALTER TABLE "usuarios" ADD COLUMN "nomeWhatsapp" TEXT;

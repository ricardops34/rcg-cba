-- Envio de recados internos por plataforma/WhatsApp e confirmação de leitura

ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'recado_interno';

ALTER TABLE "whatsapp_recados_internos" ADD COLUMN "enviarPlataforma" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "whatsapp_recados_internos" ADD COLUMN "enviarWhatsapp" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "whatsapp_recados_destinatarios" ADD COLUMN "lidoEm" TIMESTAMP(3);

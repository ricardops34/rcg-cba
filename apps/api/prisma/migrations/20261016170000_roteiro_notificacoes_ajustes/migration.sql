-- Roteiro semanal: histórico de remarcações e os avisos do fluxo.
ALTER TABLE "whatsapp_roteiro_itens" ADD COLUMN "ajustes" JSONB NOT NULL DEFAULT '[]';

ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'roteiro_confirmar';
ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'roteiro_iniciado';
ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'roteiro_cancelado';
ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'roteiro_atraso';

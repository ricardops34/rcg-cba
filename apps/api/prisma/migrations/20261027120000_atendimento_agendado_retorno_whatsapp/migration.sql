-- Tipo "Retorno WhatsApp" e o registro do atendimento agendado que não aconteceu.
ALTER TYPE "TipoAtividade" ADD VALUE IF NOT EXISTS 'retorno_whatsapp';

ALTER TABLE "atividades" ADD COLUMN "naoRealizada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "atividades" ADD COLUMN "motivoNaoRealizacao" TEXT;

ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'atendimento_nao_realizado';

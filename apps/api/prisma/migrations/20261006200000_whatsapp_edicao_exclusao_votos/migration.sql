-- Recebimento completo da Evolution GO 0.7.2 (2026-10-06): edição e exclusão
-- feitas no celular e votos de enquete.
--
-- Histórico permanente (decisão de 2026-10-02): editar guarda o texto anterior
-- em "conteudoOriginal"; apagar para todos só marca "apagadaEm", sem tirar o
-- texto — é o que o Gerencial audita.

ALTER TABLE "whatsapp_mensagens" ADD COLUMN "editadaEm" TIMESTAMP(3);
ALTER TABLE "whatsapp_mensagens" ADD COLUMN "apagadaEm" TIMESTAMP(3);
ALTER TABLE "whatsapp_mensagens" ADD COLUMN "conteudoOriginal" TEXT;
ALTER TABLE "whatsapp_mensagens" ADD COLUMN "enqueteVotos" JSONB;

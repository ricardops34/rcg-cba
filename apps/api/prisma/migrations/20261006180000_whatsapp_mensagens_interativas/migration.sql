-- Mensagens interativas da Evolution GO 0.7.2 (2026-10-06): botões, lista,
-- enquete e link com prévia, e a resposta do cliente a botão/lista
-- (evento ButtonClick). O conteúdo estruturado vai em `interativo`; `conteudo`
-- continua com o texto legível que prévia, busca e agente já leem.
--
-- ADD VALUE dentro da transação da migration é aceito no Postgres 12+; os
-- valores novos só não podem ser usados nesta mesma transação, e não são.

ALTER TYPE "WhatsappTipoMensagem" ADD VALUE IF NOT EXISTS 'botoes';
ALTER TYPE "WhatsappTipoMensagem" ADD VALUE IF NOT EXISTS 'lista';
ALTER TYPE "WhatsappTipoMensagem" ADD VALUE IF NOT EXISTS 'enquete';
ALTER TYPE "WhatsappTipoMensagem" ADD VALUE IF NOT EXISTS 'link';
ALTER TYPE "WhatsappTipoMensagem" ADD VALUE IF NOT EXISTS 'resposta';

ALTER TABLE "whatsapp_mensagens" ADD COLUMN "interativo" JSONB;

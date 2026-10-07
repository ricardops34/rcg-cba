-- O número conectado é conta comercial (WhatsApp Business)? (2026-10-07)
--
-- Verificado a cada conexão pelo nome comercial verificado que o WhatsApp
-- devolve em /user/check (só conta comercial tem). Decide recursos que o
-- WhatsApp só entrega vindo de conta comercial — a lista de opções foi aceita
-- pelo gateway e nunca entregue a partir de uma conta comum no teste real.
-- Nulo = ainda não verificado (sessões anteriores, até a próxima conexão).

ALTER TABLE "whatsapp_sessoes" ADD COLUMN "contaComercial" BOOLEAN;
ALTER TABLE "whatsapp_sessoes" ADD COLUMN "nomeComercial" TEXT;

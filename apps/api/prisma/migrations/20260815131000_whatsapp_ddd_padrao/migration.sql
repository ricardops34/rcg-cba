-- DDD a usar quando o telefone do cadastro de cliente vem sem ele.
--
-- Por que existe: nesta base a maioria dos telefones de cliente tem 8 ou 9
-- dígitos — sem DDD. Sem essa informação não há como montar o número do
-- WhatsApp a partir do cadastro, e **deduzir** o DDD manda mensagem para a
-- pessoa errada em outro estado.
--
-- Nasce nulo de propósito: enquanto ninguém configurar, o sistema recusa
-- montar o número e pede que ele seja informado.
ALTER TABLE "whatsapp_config" ADD COLUMN "dddPadrao" TEXT;

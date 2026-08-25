-- Mensagem de boas-vindas do agente, por empresa.
--
-- Abre toda conversa nova, no lugar da tela em branco. É texto da empresa e
-- não vai ao modelo — só ao vendedor, para ele saber o que dá para pedir.
--
-- Nulo = usa o texto padrão do front. `agente_config` já tem RLS (criada com
-- a tabela); ALTER TABLE não mexe na policy.

ALTER TABLE "agente_config" ADD COLUMN "mensagemBoasVindas" TEXT;

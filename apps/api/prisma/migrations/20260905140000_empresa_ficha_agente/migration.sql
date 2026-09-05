-- O que a IA pode contar sobre a empresa.
--
-- O cadastro já tinha endereço, telefone, e-mail, site e horário de
-- atendimento, mas nada disso chegava à IA: a empresa precisava redigitar tudo
-- no texto livre de Administração > WhatsApp. Estes campos completam a ficha, e
-- a ficha inteira passa a ir ao prompt (ver `fichaDaEmpresa`).
--
-- Todos opcionais: empresa cadastrada antes disto continua válida, e a IA
-- simplesmente não fala do que não foi preenchido.
ALTER TABLE "empresas"
  ADD COLUMN "telefone2" TEXT,
  ADD COLUMN "email2" TEXT,
  ADD COLUMN "fundadaEm" TIMESTAMP(3),
  ADD COLUMN "historia" TEXT,
  ADD COLUMN "segmentos" TEXT;

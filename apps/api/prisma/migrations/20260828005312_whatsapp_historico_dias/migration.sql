-- Quantos dias de histórico do aparelho a plataforma importa ao conectar uma
-- instância. Decisão do usuário em 2026-08-27.
--
-- É **diferente** de `retencaoDias`, que já existe nesta tabela: retenção é por
-- quanto tempo o que já foi gravado continua guardado (expurgo); histórico é o
-- quanto se puxa para trás do que o celular já tinha antes de a plataforma
-- existir. Uma olha para a frente, a outra para trás.
--
-- Zero mantém o comportamento atual — nada de histórico, só o que chega ao
-- vivo. É o padrão de propósito: importar conversa antiga traz para o servidor
-- material que ninguém decidiu trazer, e essa decisão é da empresa.
--
-- Não há policy nova a criar: `whatsapp_config` já tem RLS por empresa, e isto
-- é só mais uma coluna dela.

ALTER TABLE "whatsapp_config"
  ADD COLUMN "historicoDias" INTEGER NOT NULL DEFAULT 0;

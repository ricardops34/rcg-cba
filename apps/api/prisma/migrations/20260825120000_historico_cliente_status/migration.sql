-- Aprovação campo a campo da fila de alteração de cliente.
--
-- O campo que o responsável NÃO marcar não é descartado em silêncio: entra no
-- histórico do cliente como `reprovado`, com quem analisou. Linha existente é
-- toda `aplicado` — até aqui, histórico só nascia de mudança efetivada.
--
-- `cliente_historico` já tem RLS (criada com a tabela); ALTER TABLE não mexe na
-- policy, então não há nada a recriar aqui.

CREATE TYPE "StatusHistoricoCliente" AS ENUM ('aplicado', 'reprovado');

ALTER TABLE "cliente_historico"
  ADD COLUMN "status" "StatusHistoricoCliente" NOT NULL DEFAULT 'aplicado';

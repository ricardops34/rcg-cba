-- Saudação da empresa no atendimento institucional
-- (docs/planos/whatsapp-institucional-funcionarios.md, Fatia 1).
--
-- A conversa do número institucional é reaproveitada, não recriada: encerrar o
-- atendimento devolve a mesma linha para `bot`. Sem um marcador por rodada, a
-- saudação sairia uma única vez na vida da conversa, e o assunto seguinte
-- começaria no meio.
ALTER TABLE "whatsapp_conversas" ADD COLUMN "saudadoEm" TIMESTAMP(3);

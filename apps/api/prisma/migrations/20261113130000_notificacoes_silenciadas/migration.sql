-- O usuário escolhe em "Meu perfil > Notificações" quais tipos chegam ao
-- sino (decisão de 2026-11-13). Guarda o que ele DESLIGOU: tipo novo do enum
-- nasce ligado para todo mundo, sem migration de dados.
--
-- Coluna em "usuarios", que já tem RLS por grupo econômico: as policies
-- existentes cobrem a coluna nova.

ALTER TABLE "usuarios"
  ADD COLUMN "notificacoesSilenciadas" "NotificacaoTipo"[] NOT NULL DEFAULT ARRAY[]::"NotificacaoTipo"[];

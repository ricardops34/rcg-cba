-- Duas colunas em "Meu perfil > Notificações" (decisão de 2026-11-13): o
-- usuário escolhe separado o que vai para o sino e o que vira notificação do
-- navegador. Esta guarda o que fica no sino mas NÃO vai para o navegador —
-- tipo novo nasce ligado nos dois.
--
-- Coluna em "usuarios", que já tem RLS por grupo econômico: as policies
-- existentes cobrem a coluna nova.

ALTER TABLE "usuarios"
  ADD COLUMN "navegadorSilenciadas" "NotificacaoTipo"[] NOT NULL DEFAULT ARRAY[]::"NotificacaoTipo"[];

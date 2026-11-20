-- Atalhos da tela inicial escolhidos pelo próprio usuário (decisão de
-- 2026-11-20): lista ordenada de rotas (ex.: ["/crm/agenda"]). Posição de
-- Cliente e Orçamentos são fixos e não entram aqui. NULL = a lista padrão.
-- Rota que o usuário deixou de enxergar some na tela, sem limpar daqui.
--
-- Coluna em "usuarios", que já tem RLS por grupo econômico: as policies
-- existentes cobrem a coluna nova.

ALTER TABLE "usuarios" ADD COLUMN "atalhosInicio" JSONB;

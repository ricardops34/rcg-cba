-- Termos de uso customizados da empresa (em Markdown formatado).
-- A tabela empresas é a entidade de tenant raiz (sem coluna empresaId): sem policy de RLS adicional.
ALTER TABLE "empresas" ADD COLUMN "termosUso" TEXT;


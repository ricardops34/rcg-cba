-- Colaborador passa a poder existir sem usuário de sistema vinculado (ex.:
-- vendedor só pra rastrear carteira/hierarquia, sem acesso à plataforma).
-- Índice único em "usuarioId" continua válido: Postgres não considera NULLs
-- iguais entre si, então múltiplos colaboradores sem usuário coexistem.
ALTER TABLE "colaboradores" ALTER COLUMN "usuarioId" DROP NOT NULL;

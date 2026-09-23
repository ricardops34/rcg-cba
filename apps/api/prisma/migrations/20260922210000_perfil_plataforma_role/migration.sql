-- Papel do usuário dentro da plataforma (admin, financeiro, suporte).
--
-- O enum e a coluna já estavam no `schema.prisma` e o `AuthService` já os lia
-- no `findUnique` do login, mas nenhuma migration os criava. O efeito era
-- imediato e total: **o login inteiro respondia HTTP 500**, com
-- `The column usuarios.perfilPlataformaRole does not exist in the current
-- database` no log — o mesmo padrão do 500 da integração de produtos
-- (20260922190000_produto_fabricante).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PerfilPlataformaRole') THEN
    CREATE TYPE "PerfilPlataformaRole" AS ENUM ('admin_plataforma', 'financeiro_plataforma', 'suporte_plataforma');
  END IF;
END $$;

ALTER TABLE "usuarios"
  ADD COLUMN IF NOT EXISTS "perfilPlataformaRole" "PerfilPlataformaRole";

-- A estrutura de navegação é catálogo global, sem empresaId e sem dado de
-- negócio por tenant; portanto esta tabela não recebe RLS.
ALTER TABLE "menus"
  ADD COLUMN "disponivelTelaPequena" BOOLEAN NOT NULL DEFAULT true;

-- A manutenção hierárquica usa arraste e uma árvore densa. O administrador
-- pode reabilitar depois pelo próprio cadastro quando a experiência móvel for
-- redesenhada.
UPDATE "menus"
SET "disponivelTelaPequena" = false
WHERE "id" = 'seed-menu-estrutura';

-- Disponibilidade no celular por empresa: null segue o catálogo (`disponivelTelaPequena`),
-- true/false é a decisão do administrador da empresa. Coluna nova em tabelas que já têm RLS.
ALTER TABLE "empresa_modulos" ADD COLUMN "telaPequena" BOOLEAN;
ALTER TABLE "empresa_menus" ADD COLUMN "telaPequena" BOOLEAN;
ALTER TABLE "empresa_rotinas" ADD COLUMN "telaPequena" BOOLEAN;

-- Remove o campo "cargo": o escopo de dados por hierarquia passa a depender
-- só de Perfil.sistemaBase (bypass total, mesmo papel que "administrativo"
-- cargo tinha) + a árvore usuario_empresas.superiorId (igual pra qualquer
-- perfil que não seja sistemaBase). Ver docs/regras-de-negocio.md.
ALTER TABLE "usuario_empresas" DROP COLUMN "cargo";
DROP TYPE "Cargo";

-- Carteira de clientes por hierarquia (decisão de 30/09/2026):
--   Vendedor vê a própria carteira; Supervisor e Gerente, a do time abaixo;
--   só Administrador e Administrativo veem a carteira inteira.
--
-- Até aqui, usuário sem cadastro de Vendedor ligado via "sem restrição" — um
-- Vendedor cujo cadastro não estava ligado ao usuário via a empresa toda. A
-- regra passa a ser do perfil (carteiraCompleta), e quem não a tem e não tem
-- Vendedor ligado não vê carteira nenhuma.

-- 1. O atributo, marcado no Administrativo (o da plataforma e as cópias dos
--    grupos). Administrador é sistemaBase e já vê tudo pelo isAdmin; marca
--    também para o dado dizer a verdade.
ALTER TABLE "perfis" ADD COLUMN "carteiraCompleta" BOOLEAN NOT NULL DEFAULT false;

UPDATE "perfis" SET "carteiraCompleta" = true
WHERE "sistemaBase" = true OR "nome" = 'Administrativo';

-- 2. Liga o cadastro de Vendedor ao usuário quando é inequívoco, para quem
--    dependia do "sem restrição" não passar a ver nada: o usuário não tem
--    Vendedor ligado nesta empresa, o perfil dele não vê a carteira toda, e há
--    exatamente um Vendedor com o e-mail dele na empresa. Casamento por e-mail
--    ambíguo (dois cadastros, ou usuário já ligado a outro) fica para o
--    administrador resolver no cadastro de Vendedores.
WITH candidatos AS (
  SELECT v."id" AS "vendedorId", u."id" AS "usuarioId", v."empresaId"
  FROM "vendedores" v
  JOIN "usuarios" u ON lower(u."email") = lower(v."email")
  JOIN "usuario_empresas" ue
    ON ue."usuarioId" = u."id" AND ue."empresaId" = v."empresaId" AND ue."ativo" = true
  JOIN "perfis" p ON p."id" = ue."perfilId"
  WHERE v."usuarioId" IS NULL
    AND v."deletedAt" IS NULL
    AND p."carteiraCompleta" = false
    AND NOT EXISTS (
      SELECT 1 FROM "vendedores" ja
      WHERE ja."usuarioId" = u."id" AND ja."empresaId" = v."empresaId" AND ja."deletedAt" IS NULL
    )
),
unicos AS (
  SELECT "usuarioId", "empresaId", min("vendedorId") AS "vendedorId"
  FROM candidatos
  GROUP BY "usuarioId", "empresaId"
  HAVING count(*) = 1
)
UPDATE "vendedores" v
SET "usuarioId" = unicos."usuarioId", "updatedAt" = now()
FROM unicos
WHERE v."id" = unicos."vendedorId";

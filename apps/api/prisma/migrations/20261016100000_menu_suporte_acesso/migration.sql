-- Menu "Liberação de Suporte" (Administração) e a permissão dos perfis
-- administradores (sistemaBase).
--
-- A tela /admin/suporte-acesso existia sem menu: o cliente não tinha como
-- liberar o suporte, e o "Entrar como suporte" da plataforma nunca acharia
-- liberação. Ver docs/planos/2026-10-16-entrar-como-suporte.md.
--
-- O menu e a rotina vêm do catálogo (`sincronizar-catalogo`), que em produção
-- roda **depois** do migrate: sem criá-los aqui, a concessão abaixo não os
-- acha. Mesmos ids de `catalogo-sistema.ts`, idempotente; o WHERE EXISTS
-- protege a base criada do zero. Critério `sistemaBase`, não o nome — ver
-- "Migration que concede permissão" em README.md.

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-suporte-acesso',
  'seed-modulo-administracao',
  'Liberação de Suporte',
  'life-buoy',
  '/admin/suporte-acesso',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-administracao'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-administracao')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT 'seed-rotina-suporte-acesso', 'seed-menu-suporte-acesso', 'Liberação de Suporte', 'suporte-acesso', true, now(), now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-suporte-acesso')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", a."acao"::"Acao", true, now(), now()
FROM "perfis" p
JOIN "rotinas" r ON r."codigo" = 'suporte-acesso'
JOIN (VALUES ('visualizar'), ('editar')) AS a("acao") ON true
WHERE p."sistemaBase" = true
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

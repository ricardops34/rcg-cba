-- Telas de mapa (docs/planos/2026-11-20-mapas-clientes-rotas.md, 2026-11-20):
-- Comercial > Mapa de Clientes (`mapa-clientes`) e Gerencial > Mapa e Rotas
-- (`mapa-rotas`).
--
-- Menu e rotina com os mesmos ids e códigos de `catalogo-sistema.ts`,
-- idempotentes dos dois lados (ver 20261027140000_acompanhamento_equipe): em
-- produção o `sincronizar-catalogo` roda depois do `migrate deploy`, e sem
-- criá-los aqui a concessão abaixo não acharia a rotina. O `WHERE EXISTS`
-- protege a base criada do zero, em que `modulos` ainda está vazia.

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT 'seed-menu-mapa-clientes', 'seed-modulo-comercial', 'Mapa de Clientes',
       'map', '/comercial/mapa', 99, true, now(), now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-comercial')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT 'seed-menu-mapa-rotas', 'seed-modulo-gerencial', 'Mapa e Rotas',
       'route', '/gerencial/mapa', 99, true, now(), now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-gerencial')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT 'seed-rotina-mapa-clientes', 'seed-menu-mapa-clientes',
       'Mapa de Clientes', 'mapa-clientes', true, now(), now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-mapa-clientes')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT 'seed-rotina-mapa-rotas', 'seed-menu-mapa-rotas',
       'Mapa e Rotas', 'mapa-rotas', true, now(), now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-mapa-rotas')
ON CONFLICT ("codigo") DO NOTHING;

-- Mapa de Clientes: Vendedor, Supervisor, Gerente e Diretor (o Vendedor vê a
-- própria carteira; o escopo é do servidor). Por nome, como
-- 20261027140000_acompanhamento_equipe: pega o perfil global e os de grupo.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", 'visualizar'::"Acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE r."codigo" = 'mapa-clientes'
  AND p."nome" IN ('Vendedor', 'Supervisor', 'Gerente', 'Diretor')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- Mapa e Rotas: Supervisor, Gerente e Diretor (cadastrar/editar ficam para as
-- rotas de visita).
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", a."acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
CROSS JOIN (VALUES ('visualizar'::"Acao"), ('cadastrar'::"Acao"), ('editar'::"Acao")) AS a("acao")
WHERE r."codigo" = 'mapa-rotas'
  AND p."nome" IN ('Supervisor', 'Gerente', 'Diretor')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- Administradores: a barra lateral é montada pelas permissões gravadas, então
-- o sistemaBase também recebe (ver migrations/README.md, "use sistemaBase").
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", a."acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
CROSS JOIN (VALUES ('visualizar'::"Acao"), ('cadastrar'::"Acao"), ('editar'::"Acao")) AS a("acao")
WHERE r."codigo" IN ('mapa-clientes', 'mapa-rotas')
  AND p."sistemaBase" = true
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

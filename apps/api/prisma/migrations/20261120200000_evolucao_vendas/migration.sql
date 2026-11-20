-- Comercial > Evolução de Vendas (docs/planos/2026-11-20-evolucao-vendas-comercial.md,
-- 2026-11-20). Menu e rotina com os mesmos ids e códigos de `catalogo-sistema.ts`,
-- idempotentes (ver 20261120170000_perm_mapas); o `WHERE EXISTS` protege a base
-- criada do zero.
INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT 'seed-menu-evolucao-vendas', 'seed-modulo-comercial', 'Evolução de Vendas',
       'chart-line', '/comercial/evolucao-vendas', 99, true, now(), now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-comercial')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT 'seed-rotina-evolucao-vendas', 'seed-menu-evolucao-vendas',
       'Evolução de Vendas', 'evolucao-vendas', true, now(), now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-evolucao-vendas')
ON CONFLICT ("codigo") DO NOTHING;

-- Vendedor, Supervisor, Gerente e Diretor: cada um vê a própria carteira (o
-- escopo é do servidor). Por nome, perfil global e os de grupo.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", 'visualizar'::"Acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE r."codigo" = 'evolucao-vendas'
  AND p."nome" IN ('Vendedor', 'Supervisor', 'Gerente', 'Diretor')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- Administradores: a barra lateral é montada pelas permissões gravadas.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", 'visualizar'::"Acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE r."codigo" = 'evolucao-vendas'
  AND p."sistemaBase" = true
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

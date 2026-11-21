-- CRM > Prospecção de Leads (docs/planos/2026-11-20-prospeccao-leads-receita.md,
-- 2026-11-20): coletar empresas na base da Receita para virar lead. Menu e rotina
-- com os mesmos ids e códigos de `catalogo-sistema.ts`, idempotentes (ver
-- 20261120200000_evolucao_vendas); o `WHERE EXISTS` protege a base criada do zero.
INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT 'seed-menu-prospeccao-leads', 'seed-modulo-crm', 'Prospecção de Leads',
       'radar', '/comercial/prospeccao', 99, true, now(), now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-crm')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT 'seed-rotina-prospeccao-leads', 'seed-menu-prospeccao-leads',
       'Prospecção de Leads', 'prospeccao-leads', true, now(), now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-prospeccao-leads')
ON CONFLICT ("codigo") DO NOTHING;

-- Supervisor, Gerente e Diretor coletam (o Vendedor não: ele recebe os leads já
-- distribuídos). Por nome, perfil global e os de grupo.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", a."acao"::"Acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
CROSS JOIN (VALUES ('visualizar'), ('cadastrar')) AS a("acao")
WHERE r."codigo" = 'prospeccao-leads'
  AND p."nome" IN ('Supervisor', 'Gerente', 'Diretor')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- Administradores: a barra lateral é montada pelas permissões gravadas.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", a."acao"::"Acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
CROSS JOIN (VALUES ('visualizar'), ('cadastrar')) AS a("acao")
WHERE r."codigo" = 'prospeccao-leads'
  AND p."sistemaBase" = true
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- Rotina "Leads" (fila do que a IA captou no número institucional), numa base
-- que já existe.
--
-- Mesma forma da `20260902120000_perm_meus_atendimentos`, e pelo mesmo motivo:
-- o deploy roda `migrate deploy` antes de `sincronizar-catalogo`, então a
-- migration precisa criar menu e rotina para ter o que conceder. Os ids e o
-- código são os mesmos de `catalogo-sistema.ts`, e os dois lados são
-- idempotentes — quem roda o sincronizador depois não encontra nada a fazer.
--
-- O `WHERE EXISTS` protege a criação de uma base do zero, onde `modulos` ainda
-- está vazia quando isto roda e o INSERT morreria na chave estrangeira.

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-leads',
  'seed-modulo-comercial',
  'Leads',
  'user-search',
  '/comercial/leads',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-comercial'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-comercial')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-leads',
  'seed-menu-leads',
  'Leads',
  'leads',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-leads')
ON CONFLICT ("codigo") DO NOTHING;

-- `visualizar` para quem atende, o vendedor incluído: ele precisa ver o lead
-- que lhe foi entregue. Não há alcance escondido nisso — o recorte da lista é
-- do service (`LeadsService.listar`): quem não tem equipe abaixo só enxerga os
-- leads em que é o vendedor.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  p."id",
  r."id",
  'visualizar'::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE r."codigo" = 'leads'
  AND p."nome" IN ('Administrador', 'Diretor', 'Gerente', 'Supervisor', 'Vendedor')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- `editar` (distribuir, descartar, anotar) fica com quem distribui. O vendedor
-- fica de fora de propósito: se ele pudesse editar, poderia puxar para si um
-- lead entregue a outro.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  p."id",
  r."id",
  'editar'::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE r."codigo" = 'leads'
  AND p."nome" IN ('Administrador', 'Diretor', 'Gerente', 'Supervisor')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

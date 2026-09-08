-- Menus, rotinas e permissões de Fornecedores e Notas de Entrada, numa base
-- que já existe.
--
-- Mesma forma da `20260908020000_consulta_vendas_categoria`, e pelo mesmo
-- motivo: o deploy roda `migrate deploy` **antes** de `sincronizar-catalogo`,
-- então a migration precisa criar menu e rotina para ter o que conceder. Os
-- ids e os códigos são os mesmos de `catalogo-sistema.ts`, e os dois lados são
-- idempotentes.
--
-- O `WHERE EXISTS` protege a criação de uma base do zero, onde `modulos` ainda
-- está vazia quando isto roda e o INSERT morreria na chave estrangeira.

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-fornecedores',
  'seed-modulo-cadastros',
  'Fornecedores',
  'truck',
  '/cadastros/fornecedores',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-cadastros'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-cadastros')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-fornecedores',
  'seed-menu-fornecedores',
  'Fornecedores',
  'fornecedores',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-fornecedores')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-notas-entrada',
  'seed-modulo-cadastros',
  'Notas de Entrada',
  'file-input',
  '/cadastros/notas-entrada',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-cadastros'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-cadastros')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-notas-entrada',
  'seed-menu-notas-entrada',
  'Notas de Entrada',
  'notas-entrada',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-notas-entrada')
ON CONFLICT ("codigo") DO NOTHING;

-- `visualizar` só para Administrador e Diretor, e é decisão, não esquecimento:
-- a nota de entrada carrega o custo de compra, e vendedor com acesso a isso
-- enxerga a margem de tudo que vende. O fornecedor vai junto porque, sem ele,
-- a lista de notas mostraria só código.
--
-- Espelho read-only do ERP: `visualizar` é a única ação que os endpoints
-- exigem, então conceder as demais não teria efeito.
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
WHERE r."codigo" IN ('fornecedores', 'notas-entrada')
  AND p."nome" IN ('Administrador', 'Diretor')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

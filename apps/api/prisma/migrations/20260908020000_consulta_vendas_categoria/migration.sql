-- Rotina "Vendas por Categoria" (a consulta por produto agrupada em árvore
-- categoria → subcategoria → produto), numa base que já existe.
--
-- Mesma forma da `20260905230000_perm_leads`, e pelo mesmo motivo: o deploy
-- roda `migrate deploy` antes de `sincronizar-catalogo`, então a migration
-- precisa criar menu e rotina para ter o que conceder. Os ids e o código são
-- os mesmos de `catalogo-sistema.ts`, e os dois lados são idempotentes.
--
-- O `WHERE EXISTS` protege a criação de uma base do zero, onde `modulos` ainda
-- está vazia quando isto roda e o INSERT morreria na chave estrangeira.

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-consulta-vendas-categoria',
  'seed-modulo-consultas',
  'Vendas por Categoria',
  'folder-tree',
  '/consultas/vendas-categoria',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-consultas'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-consultas')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-consulta-vendas-categoria',
  'seed-menu-consulta-vendas-categoria',
  'Vendas por Categoria',
  'consulta-vendas-categoria',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-consulta-vendas-categoria')
ON CONFLICT ("codigo") DO NOTHING;

-- `visualizar` para todo mundo que já enxerga as outras consultas de venda: a
-- apuração é a mesma da consulta por produto, e o recorte de quem vê o quê é
-- do service (escopo hierárquico de carteira), não desta permissão.
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
WHERE r."codigo" = 'consulta-vendas-categoria'
  AND p."nome" IN ('Administrador', 'Diretor', 'Gerente', 'Supervisor', 'Vendedor')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- `exportar` (os botões de PDF e Excel) vai para os mesmos dois perfis que
-- exportam as demais consultas hoje — Administrador e Diretor, que no seed
-- nascem com todas as ações. Gerente, Supervisor e Vendedor consultam na tela;
-- levar o relatório para fora é outra decisão, e é do administrador dar.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  p."id",
  r."id",
  'exportar'::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE r."codigo" = 'consulta-vendas-categoria'
  AND p."nome" IN ('Administrador', 'Diretor')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

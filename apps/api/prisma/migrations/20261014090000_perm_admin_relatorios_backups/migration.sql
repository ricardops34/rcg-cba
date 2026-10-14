-- Relatórios e Backups para os perfis administradores (sistemaBase).
--
-- A API libera tudo ao administrador pelo isAdmin, mas o **menu** do web só
-- mostra a rotina que tem a linha `visualizar` gravada no perfil — e as
-- migrations 20261013230000_modulo_relatorios e a rotina Backups (catálogo)
-- não gravaram para os administradores. Resultado: o administrador não via os
-- menus Relatórios e Backups (achado em 2026-10-14). Critério `sistemaBase`,
-- não o nome — ver "Migration que concede permissão" em README.md.

-- A rotina Backups vem do catálogo (`sincronizar-catalogo`), que em produção
-- roda **depois** do migrate: sem criá-la aqui, a concessão abaixo não a acha.
-- Mesmos ids de `catalogo-sistema.ts`, idempotente; o WHERE EXISTS protege a
-- base criada do zero.
INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-backups',
  'seed-modulo-administracao',
  'Backups',
  'archive',
  '/admin/backups',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-administracao'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-administracao')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT 'seed-rotina-backups', 'seed-menu-backups', 'Backups', 'backups', true, now(), now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-backups')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", a."acao"::"Acao", true, now(), now()
FROM "perfis" p
JOIN "rotinas" r ON r."codigo" IN ('relatorio-compras', 'relatorio-vendas', 'relatorio-estoque-compra', 'backups')
JOIN (VALUES
  ('relatorio-compras', 'visualizar'), ('relatorio-compras', 'exportar'),
  ('relatorio-vendas', 'visualizar'), ('relatorio-vendas', 'exportar'),
  ('relatorio-estoque-compra', 'visualizar'), ('relatorio-estoque-compra', 'exportar'),
  ('backups', 'visualizar'), ('backups', 'exportar'), ('backups', 'excluir')
) AS a("codigo", "acao") ON a."codigo" = r."codigo"
WHERE p."sistemaBase" = true
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

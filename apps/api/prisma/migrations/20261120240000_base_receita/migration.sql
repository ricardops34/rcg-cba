-- Administração > Base da Receita (docs/planos/2026-11-20-prospeccao-leads-receita.md,
-- 2026-11-20): parâmetros e carga da base própria da Receita e os parâmetros da
-- coleta de leads. Menu e rotina com os mesmos ids do `catalogo-sistema.ts`;
-- modelo: 20261116140000_geocodificacao_clientes.
INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-base-receita',
  'seed-modulo-administracao',
  'Base da Receita',
  'database',
  '/admin/base-receita',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-administracao'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-administracao')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT 'seed-rotina-base-receita', 'seed-menu-base-receita', 'Base da Receita', 'base-receita', true, now(), now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-base-receita')
ON CONFLICT ("codigo") DO NOTHING;

-- Critério `sistemaBase` (ver "Migration que concede permissão" no README).
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", a."acao"::"Acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
CROSS JOIN (
  VALUES ('visualizar'), ('cadastrar'), ('editar'), ('excluir'),
         ('importar'), ('exportar'), ('aprovar'), ('cancelar'), ('bloquear')
) AS a("acao")
WHERE r."codigo" = 'base-receita'
  AND p."sistemaBase" = true
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

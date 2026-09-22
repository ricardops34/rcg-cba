-- Rotina "Produtos" do módulo Cadastros (o CRUD) numa base que já existe.
--
-- Mesma forma da `20260905181000_perm_produtos_campos`: o deploy roda
-- `migrate deploy` antes de `sincronizar-catalogo`, então a migration cria menu
-- e rotina para ter o que conceder. Ids e código são os mesmos de
-- `catalogo-sistema.ts`, e os dois lados são idempotentes.
--
-- Por que uma rotina nova em vez de reusar `produtos`: o menu nasce da
-- permissão (`<codigo>.visualizar`), então com um código só quem consulta o
-- catálogo no Comercial passaria a ver também a tela de manutenção. Os
-- endpoints de /produtos aceitam as duas rotinas (RequirePermission é um OR).

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-produtos-cadastro',
  'seed-modulo-cadastros',
  'Produtos',
  'package',
  '/cadastros/produtos',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-cadastros'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-cadastros')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-produtos-cadastro',
  'seed-menu-produtos-cadastro',
  'Produtos',
  'produtos-cadastro',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-produtos-cadastro')
ON CONFLICT ("codigo") DO NOTHING;

-- O Administrador de uma base já existente não passa pelo seed, então sem isto
-- a tela nasceria invisível até alguém marcá-la à mão. Os demais perfis ficam
-- para o administrador decidir na tela de Perfis: quem mantém o cadastro de
-- produtos é escolha do cliente, não desta migration.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  p."id",
  r."id",
  a."acao"::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN "rotinas" r
CROSS JOIN (VALUES ('visualizar'), ('cadastrar'), ('editar'), ('excluir')) AS a("acao")
WHERE r."codigo" = 'produtos-cadastro'
  AND p."nome" = 'Administrador'
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

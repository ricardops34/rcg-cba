-- Rotina "Campos do Produto" numa base que já existe.
--
-- Mesma forma da `20260902120000_perm_meus_atendimentos`: o deploy roda
-- `migrate deploy` antes de `sincronizar-catalogo`, então a migration cria menu
-- e rotina para ter o que conceder. Ids e código são os mesmos de
-- `catalogo-sistema.ts`, e os dois lados são idempotentes.
--
-- Não há INSERT em `perfil_permissoes` aqui: a rotina é de Administração, e o
-- perfil Administrador recebe **todas** as ações de **todas** as rotinas no
-- `seed-base.ts`. Numa base já existente, quem concede é o próprio
-- administrador na tela de Perfis — conceder por migration a um perfil que o
-- cliente pode ter recortado seria desfazer a configuração dele.
--
-- O Diretor fica de fora por regra, não por esquecimento: rotina de
-- Administração não é dele (ver `corrigirPermissoesDoDiretor`).

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-produtos-campos',
  'seed-modulo-administracao',
  'Campos do Produto',
  'ruler',
  '/admin/produtos-campos',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-administracao'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-administracao')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-produtos-campos',
  'seed-menu-produtos-campos',
  'Campos do Produto',
  'produtos-campos',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-produtos-campos')
ON CONFLICT ("codigo") DO NOTHING;

-- O Administrador de uma base já existente não passa pelo seed, então sem isto
-- a tela nasceria invisível até alguém marcá-la à mão.
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
WHERE r."codigo" = 'produtos-campos'
  AND p."nome" = 'Administrador'
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

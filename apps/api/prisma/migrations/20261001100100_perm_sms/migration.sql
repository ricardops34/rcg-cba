-- Rotina "SMS" (Administração): saldo, webhook e estatística dos envios pela
-- iAgente. Concede as 9 ações aos perfis de administração numa base que já existe.
--
-- Cria também o menu e a rotina, com os mesmos ids e código do
-- `catalogo-sistema.ts`, porque a ordem de deploy é `migrate deploy` e só
-- depois `sincronizar-catalogo`: sem isto a concessão não acharia a rotina
-- (modelo: `20260902120000_perm_meus_atendimentos`). O `WHERE EXISTS` evita
-- derrubar a criação de uma base do zero, em que `modulos` ainda está vazia —
-- ali quem cria tudo é o seed.
--
-- Critério `sistemaBase`, não o nome do perfil — ver "Migration que concede
-- permissão" em `migrations/README.md`. Os demais perfis ficam de fora: dar a
-- tela a eles é decisão do cliente, na tela de Perfis.
INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-sms',
  'seed-modulo-administracao',
  'SMS',
  'message-square-text',
  '/admin/sms',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-administracao'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-administracao')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-sms',
  'seed-menu-sms',
  'SMS',
  'sms',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-sms')
ON CONFLICT ("codigo") DO NOTHING;

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
CROSS JOIN (
  VALUES ('visualizar'), ('cadastrar'), ('editar'), ('excluir'),
         ('importar'), ('exportar'), ('aprovar'), ('cancelar'), ('bloquear')
) AS a("acao")
WHERE r."codigo" = 'sms'
  AND p."sistemaBase" = true
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

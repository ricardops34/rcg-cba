-- Perfis Supervisor e Gerente, com as mesmas permissões do perfil Vendedor.
--
-- As permissões são copiadas do Vendedor **daquele banco**, não de uma lista
-- fixa: dev e produção podem ter ajustes feitos pela tela de Perfis, e o que
-- se quer é espelhar o Vendedor vigente em cada ambiente.
--
-- O que diferencia os três não é o RBAC, e sim o alcance da carteira, que vem
-- do cadastro de Vendedores (flags supervisor/gerente + supervisorId/
-- gerenteId) e é resolvido em resolverEscopoVendedores.
--
-- Idempotente: não recria perfil existente nem duplica permissão.
-- sistemaBase fica false de propósito — true ligaria isAdmin no JWT e o
-- PermissionsGuard passaria a ignorar toda checagem de permissão.

INSERT INTO "perfis" ("id", "nome", "descricao", "sistemaBase", "ativo", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  novo."nome",
  'Mesmas telas do Vendedor; a carteira alcançada vem da hierarquia do cadastro de Vendedores',
  false,
  true,
  now(),
  now()
FROM (VALUES ('Supervisor'), ('Gerente')) AS novo("nome")
WHERE NOT EXISTS (
  SELECT 1 FROM "perfis" p WHERE p."nome" = novo."nome"
);

INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  destino."id",
  origem."rotinaId",
  origem."acao",
  origem."permitido",
  now(),
  now()
FROM "perfis" destino
JOIN "perfis" base ON base."nome" = 'Vendedor'
JOIN "perfil_permissoes" origem ON origem."perfilId" = base."id"
WHERE destino."nome" IN ('Supervisor', 'Gerente')
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- Rotina "Vendas por CNAE" (a consulta por produto agrupada em árvore CNAE
-- do cliente → produto), numa base que já existe.
--
-- Mesma forma da `20260908020000_consulta_vendas_categoria`, e pelo mesmo
-- motivo: o deploy roda `migrate deploy` antes de `sincronizar-catalogo`,
-- então a migration precisa criar menu e rotina para ter o que conceder. Os
-- ids e o código são os mesmos de `catalogo-sistema.ts`, e os dois lados são
-- idempotentes.
--
-- O `WHERE EXISTS` protege a criação de uma base do zero, onde `modulos`
-- ainda está vazia quando isto roda e o INSERT morreria na chave estrangeira.

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-consulta-vendas-cnae',
  'seed-modulo-consultas',
  'Vendas por CNAE',
  'tags',
  '/consultas/vendas-cnae',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-consultas'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-consultas')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-consulta-vendas-cnae',
  'seed-menu-consulta-vendas-cnae',
  'Vendas por CNAE',
  'consulta-vendas-cnae',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-consulta-vendas-cnae')
ON CONFLICT ("codigo") DO NOTHING;

-- `visualizar`: quem é sistemaBase (o perfil com acesso total da empresa —
-- ver "Migration que concede permissão" em migrations/README.md; não usamos
-- o nome do perfil, porque 'Administrador' sozinho não bate com
-- "Administrador Empresa"/"Administrador da Plataforma") mais os perfis
-- padrão não-admin que já enxergam as outras consultas de venda
-- (VENDEDOR_PERMISSOES/ADMINISTRATIVO_PERMISSOES em catalogo-sistema.ts). A
-- apuração é a mesma da consulta por produto/categoria; o recorte de quem vê
-- o quê é do service (escopo hierárquico de carteira), não desta permissão.
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
WHERE r."codigo" = 'consulta-vendas-cnae'
  AND (
    p."sistemaBase" = true
    OR p."nome" IN ('Diretor', 'Gerente', 'Supervisor', 'Vendedor', 'Administrativo')
  )
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- `exportar` (os botões de PDF e Excel): só quem é sistemaBase, mesmo
-- critério da consulta por categoria (lá, por nome de perfil — aqui,
-- corrigido para sistemaBase). Os demais perfis consultam na tela; levar o
-- relatório para fora é decisão do administrador, concedida pela tela de
-- Perfis quando ele quiser.
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
WHERE r."codigo" = 'consulta-vendas-cnae'
  AND p."sistemaBase" = true
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

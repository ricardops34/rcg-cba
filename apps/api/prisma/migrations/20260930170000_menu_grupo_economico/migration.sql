-- Menu "Grupo Econômico" em Administração, com rotina própria, numa base que
-- já existe.
--
-- Antes a tela só abria por um botão dentro de Empresas, e o usuário não a
-- encontrava no menu. Estrutura mora em `catalogo-sistema.ts`, mas
-- `sincronizar-catalogo` não concede permissão, e a barra lateral é montada
-- pelas permissões gravadas — inclusive as de quem é sistemaBase. Por isso a
-- migration cria menu e rotina (mesmos ids e código do catálogo, ON CONFLICT
-- DO NOTHING) e concede. Modelo: 20260902120000_perm_meus_atendimentos.
--
-- WHERE EXISTS: numa base criada do zero, `modulos` ainda está vazia quando as
-- migrations rodam; sem o guarda o INSERT morreria na FK e derrubaria o deploy.
-- Ali o seed-base.ts cria tudo a partir do catálogo.

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-grupo-economico',
  'seed-modulo-administracao',
  'Grupo Econômico',
  'network',
  '/admin/grupo-economico',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-administracao'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-administracao')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-grupo-economico',
  'seed-menu-grupo-economico',
  'Grupo Econômico',
  'grupo-economico',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-grupo-economico')
ON CONFLICT ("codigo") DO NOTHING;

-- Quem recebe: os perfis de administração (sistemaBase), com as 9 ações, como
-- o seed faz. O critério é sistemaBase, não o nome do perfil — ver
-- migrations/README.md. O Diretor fica de fora: é rotina de Administração.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", a.acao::"Acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
CROSS JOIN (VALUES ('visualizar'), ('cadastrar'), ('editar'), ('excluir'), ('importar'),
                   ('exportar'), ('aprovar'), ('cancelar'), ('bloquear')) AS a(acao)
WHERE r."codigo" = 'grupo-economico'
  AND p."sistemaBase" = true
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

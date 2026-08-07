-- Menu, rotina e permissões da tela de Regras de Desconto (módulo Cadastros).
--
-- Migration de dados pelo mesmo motivo do menu de Clientes: estes registros
-- são semeados por seed-base.ts, que é destrutivo e não roda em produção —
-- sem isto a tela existiria sem porta de entrada no stack de produção.
-- Tudo idempotente (ON CONFLICT DO NOTHING), restrito aos ids semeados.

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-menu-regras-desconto',
  'seed-modulo-cadastros',
  'Regras de Desconto',
  'percent',
  '/cadastros/regras-desconto',
  -- Depois dos demais cadastros já semeados.
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-cadastros'),
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-rotina-regras-desconto',
  'seed-menu-regras-desconto',
  'Regras de Desconto',
  'regras-desconto',
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

-- Perfil Administrador recebe todas as ações da rotina nova, como o seed faria.
-- Os demais perfis são configurados na tela de Perfis.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  'seed-perm-regras-desconto-' || p."id" || '-' || a."acao",
  p."id",
  'seed-rotina-regras-desconto',
  a."acao"::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN (
  SELECT unnest(ARRAY[
    'visualizar', 'cadastrar', 'editar', 'excluir',
    'importar', 'exportar', 'aprovar', 'cancelar', 'bloquear'
  ]) AS "acao"
) a
WHERE p."nome" = 'Administrador'
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

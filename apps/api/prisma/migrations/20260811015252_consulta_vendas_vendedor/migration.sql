-- Terceira consulta do módulo: vendas do ano por vendedor, mês a mês.
-- Rotina própria, como as outras duas, para que a permissão de exportar possa
-- ser dada em uma e não na outra.

INSERT INTO "menus" ("id", "moduloId", "nome", "rota", "icone", "ordem", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-menu-consulta-vendas-vendedor',
  'seed-modulo-consultas',
  'Vendas por Vendedor',
  '/consultas/vendas-vendedor',
  'user-round',
  3,
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-rotina-consulta-vendas-vendedor',
  'seed-menu-consulta-vendas-vendedor',
  'Vendas por Vendedor',
  'consulta-vendas-vendedor',
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

-- Administrador recebe tudo; os demais perfis ficam sem a rotina até que o
-- admin marque na tela de Perfis.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  'seed-perm-consulta-vendas-vendedor-' || p."id" || '-' || a."acao",
  p."id",
  'seed-rotina-consulta-vendas-vendedor',
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

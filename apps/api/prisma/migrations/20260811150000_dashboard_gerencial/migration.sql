-- Dashboard Gerencial: acompanhamento do mês por vendedor (objetivo x
-- realizado x positivação) com corte por dia, no módulo Gerencial.
--
-- Rotina própria, separada de `dashboard-comercial`: são públicos diferentes —
-- o comercial abre por categoria para o vendedor, o gerencial abre por
-- vendedor para quem cobra a equipe.
--
-- Sem DDL: a consulta é somente leitura sobre objetivos/notas/clientes.

INSERT INTO "menus" ("id", "moduloId", "nome", "rota", "icone", "ordem", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-menu-dashboard-gerencial',
  'seed-modulo-gerencial',
  'Dashboard Gerencial',
  '/gerencial/dashboard',
  'gauge',
  1,
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-rotina-dashboard-gerencial',
  'seed-menu-dashboard-gerencial',
  'Dashboard Gerencial',
  'dashboard-gerencial',
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

-- Administrador recebe tudo; os demais perfis ficam sem a rotina até que o
-- admin marque na tela de Perfis.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  'seed-perm-dashboard-gerencial-' || p."id" || '-' || a."acao",
  p."id",
  'seed-rotina-dashboard-gerencial',
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

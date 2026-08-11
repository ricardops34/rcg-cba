-- Módulo Consultas: relatórios gerenciais de venda, read-only.
--
-- Duas telas, cada uma com rotina própria — assim a permissão de exportar
-- (PDF/Excel) pode ser dada em uma e não na outra, pela tela de Perfis.
-- Migration de dados porque seed-base.ts não roda em produção.

INSERT INTO "modulos" ("id", "nome", "icone", "ordem", "ativo", "createdAt", "updatedAt")
VALUES ('seed-modulo-consultas', 'Consultas', 'chart-column', 4, true, now(), now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "menus" ("id", "moduloId", "nome", "rota", "icone", "ordem", "ativo", "createdAt", "updatedAt")
VALUES
  (
    'seed-menu-consulta-vendas-cliente',
    'seed-modulo-consultas',
    'Vendas por Cliente',
    '/consultas/vendas-cliente',
    'users-round',
    1,
    true,
    now(),
    now()
  ),
  (
    'seed-menu-consulta-vendas-produto',
    'seed-modulo-consultas',
    'Vendas por Produto',
    '/consultas/vendas-produto',
    'package-search',
    2,
    true,
    now(),
    now()
  )
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES
  (
    'seed-rotina-consulta-vendas-cliente',
    'seed-menu-consulta-vendas-cliente',
    'Vendas por Cliente',
    'consulta-vendas-cliente',
    true,
    now(),
    now()
  ),
  (
    'seed-rotina-consulta-vendas-produto',
    'seed-menu-consulta-vendas-produto',
    'Vendas por Produto',
    'consulta-vendas-produto',
    true,
    now(),
    now()
  )
ON CONFLICT ("id") DO NOTHING;

-- Administrador recebe tudo (inclusive exportar); os demais perfis ficam sem
-- as rotinas até que o admin marque na tela de Perfis.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  'seed-perm-' || r."rotinaId" || '-' || p."id" || '-' || a."acao",
  p."id",
  r."rotinaId",
  a."acao"::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN (
  SELECT unnest(ARRAY[
    'seed-rotina-consulta-vendas-cliente',
    'seed-rotina-consulta-vendas-produto'
  ]) AS "rotinaId"
) r
CROSS JOIN (
  SELECT unnest(ARRAY[
    'visualizar', 'cadastrar', 'editar', 'excluir',
    'importar', 'exportar', 'aprovar', 'cancelar', 'bloquear'
  ]) AS "acao"
) a
WHERE p."nome" = 'Administrador'
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- Qual vendedor a consulta credita: 'nota' (quem vendeu) ou 'cliente' (o
-- titular da carteira). Uma linha por empresa, editável em Administração >
-- Parâmetros.
INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  e."id",
  'CONSULTA_VENDAS_BASE_VENDEDOR',
  'texto'::"TipoParametro",
  10,
  'nota',
  'Vendedor considerado nas Consultas de venda: nota (quem vendeu) ou cliente (titular da carteira)',
  true,
  now(),
  now()
FROM "empresas" e
ON CONFLICT ("empresaId", "parametro") DO NOTHING;

-- Quarta consulta do módulo: evolução mensal em gráfico (vendas, clientes
-- positivados, clientes novos e clientes inativados), uma série por vendedor.
-- Rotina própria, como as outras três, para que a permissão de exportar possa
-- ser dada em uma e não na outra.
--
-- Sem DDL: a consulta é somente leitura sobre notas_saida/clientes, e não cria
-- tabela nenhuma — daí não haver policy de RLS a criar aqui.

INSERT INTO "menus" ("id", "moduloId", "nome", "rota", "icone", "ordem", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-menu-consulta-evolucao',
  'seed-modulo-consultas',
  'Evolução Mensal',
  '/consultas/evolucao',
  'trending-up',
  4,
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-rotina-consulta-evolucao',
  'seed-menu-consulta-evolucao',
  'Evolução Mensal',
  'consulta-evolucao',
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

-- Administrador recebe tudo; os demais perfis ficam sem a rotina até que o
-- admin marque na tela de Perfis.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  'seed-perm-consulta-evolucao-' || p."id" || '-' || a."acao",
  p."id",
  'seed-rotina-consulta-evolucao',
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

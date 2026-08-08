-- Permissão que controla quem enxerga os valores de comissão nos itens de
-- orçamento e de nota de saída (`comissao.visualizar`). O perfil Vendedor não
-- a recebe; o Administrador sim. Quem quiser liberar para outro perfil faz
-- pela tela de Perfis, sem deploy.
--
-- Rotina sem tela própria, pendurada no menu de Orçamentos — mesmo padrão de
-- 'modulos'/'rotinas', que ficam sob Estrutura de Menu. Migration de dados
-- porque seed-base.ts não roda em produção.

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-rotina-comissao',
  'seed-menu-orcamentos',
  'Comissão (valores)',
  'comissao',
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

-- Administrador enxerga; os demais perfis ficam sem a permissão até que o
-- admin marque na tela de Perfis.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  'seed-perm-comissao-' || p."id" || '-' || a."acao",
  p."id",
  'seed-rotina-comissao',
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

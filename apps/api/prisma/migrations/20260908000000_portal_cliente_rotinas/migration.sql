-- Catálogo de rotinas do Portal do Cliente, numa base que já existe.
--
-- `portal_cliente_rotinas` nasceu vazia na baseline e nunca foi populada: nem o
-- `seed-base.ts` nem o `sincronizar-catalogo.ts` a conhecem (os dois tratam do
-- catálogo do sistema interno — `modulos`/`menus`/`rotinas`). Sem linha aqui,
-- `PortalClienteAdminService.criarAcesso` monta o perfil "Administrador do
-- cliente" a partir de uma lista vazia, o contato recebe um token com
-- `permissoes: []` e toda rotina do portal responde 403.
--
-- A tabela é global (sem `empresaId`, sem RLS) e seu conteúdo é fixo: é o
-- vocabulário que o código usa, não configuração de cliente. Por isso entra por
-- migration — que roda tanto na base existente quanto numa criada do zero,
-- antes do seed — e não pelo seed, que destrói dado real.
--
-- Os códigos e as ações são exatamente os de `ACOES` em
-- `portal-cliente-admin.service.ts`; conceder ação que o código não consome
-- criaria permissão que nada lê.

INSERT INTO "portal_cliente_rotinas" ("id", "codigo", "nome", "ordem", "ativo")
VALUES
  ('portal-rotina-cadastro',   'cadastro',   'Meu cadastro',          1, true),
  ('portal-rotina-contatos',   'contatos',   'Contatos',              2, true),
  ('portal-rotina-notas',      'notas',      'Notas fiscais',         3, true),
  ('portal-rotina-compras',    'compras',    'Histórico de compras',  4, true),
  ('portal-rotina-titulos',    'titulos',    'Títulos',               5, true),
  ('portal-rotina-orcamentos', 'orcamentos', 'Orçamentos',            6, true),
  ('portal-rotina-catalogo',   'catalogo',   'Catálogo',              7, true),
  ('portal-rotina-carrinho',   'carrinho',   'Carrinho',              8, true)
ON CONFLICT ("codigo") DO NOTHING;

-- Perfis "Administrador do cliente" criados antes desta migration ficaram sem
-- nenhuma permissão. Só eles são corrigidos (`sistemaBase`): perfil montado à
-- mão pela empresa é decisão dela, e recolocar permissão desfaria a escolha —
-- a mesma regra que o `sincronizar-catalogo.ts` segue no sistema interno.
INSERT INTO "portal_cliente_perfil_permissoes" ("id", "empresaId", "perfilId", "rotinaId", "acao", "permitido")
SELECT gen_random_uuid(), p."empresaId", p."id", r."id", a."acao", true
FROM "portal_cliente_perfis" p
CROSS JOIN (VALUES
  ('cadastro',   'visualizar'),
  ('cadastro',   'editar'),
  ('contatos',   'visualizar'),
  ('contatos',   'cadastrar'),
  ('contatos',   'editar'),
  ('notas',      'visualizar'),
  ('notas',      'segunda-via'),
  ('compras',    'visualizar'),
  ('titulos',    'visualizar'),
  ('titulos',    'segunda-via'),
  ('orcamentos', 'visualizar'),
  ('orcamentos', 'aprovar'),
  ('orcamentos', 'recusar'),
  ('catalogo',   'visualizar'),
  ('carrinho',   'visualizar'),
  ('carrinho',   'comprar')
) AS a("codigo", "acao")
JOIN "portal_cliente_rotinas" r ON r."codigo" = a."codigo"
WHERE p."sistemaBase" = true
  AND p."ativo" = true
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

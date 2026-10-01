-- E-mail com o mesmo desenho do SMS (decisão do usuário, 01/10/2026): chave
-- de habilitar e uma por funcionalidade, nos parâmetros, editadas junto com os
-- SMTP_* pela tela Administração > E-mail.
--
-- EMAIL_ATIVO nasce LIGADO, ao contrário do SMS_ATIVO: o e-mail de senha já
-- estava em uso quando a chave chegou, e nascer desligado cortaria o envio
-- no deploy. `NULL::integer` na primeira linha: com todos os tamanhos nulos o
-- Postgres deduz a coluna do VALUES como texto e o INSERT falha (42804).
INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), e."id", p."parametro", p."tipo"::"TipoParametro",
       p."tamanho", p."conteudo", p."descricao", true, now(), now()
FROM "empresas" e
CROSS JOIN (
  VALUES
    ('EMAIL_ATIVO', 'booleano', NULL::integer, 'true', 'Habilita o envio de e-mail nesta empresa'),
    ('EMAIL_DOCUMENTOS', 'booleano', NULL, 'true', 'Permite enviar DANFE e XML por e-mail ao cliente'),
    ('EMAIL_BOLETO', 'booleano', NULL, 'true', 'Permite enviar boleto por e-mail ao cliente'),
    ('EMAIL_COBRANCA', 'booleano', NULL, 'true', 'Permite enviar cobrança de títulos vencidos por e-mail'),
    ('EMAIL_SENHA_PROVISORIA', 'booleano', NULL, 'true', 'Envia a senha provisória do vendedor por e-mail')
) AS p("parametro", "tipo", "tamanho", "conteudo", "descricao")
WHERE e."deletedAt" IS NULL
ON CONFLICT ("empresaId", "parametro") DO NOTHING;

-- Rotina "E-mail" (Administração), como a de SMS: menu e rotina com os ids do
-- catálogo (o migrate deploy roda antes do sincronizar-catalogo) e as 9 ações
-- para os perfis de administração (sistemaBase).
INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-email',
  'seed-modulo-administracao',
  'E-mail',
  'mail',
  '/admin/email',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-administracao'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-administracao')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-email',
  'seed-menu-email',
  'E-mail',
  'email',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-email')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  p."id",
  r."id",
  a."acao"::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN "rotinas" r
CROSS JOIN (
  VALUES ('visualizar'), ('cadastrar'), ('editar'), ('excluir'),
         ('importar'), ('exportar'), ('aprovar'), ('cancelar'), ('bloquear')
) AS a("acao")
WHERE r."codigo" = 'email'
  AND p."sistemaBase" = true
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

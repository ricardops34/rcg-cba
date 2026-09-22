-- Conceder `produtos-cadastro` aos perfis administradores.
--
-- Complementa a `20260922120000_perm_produtos_cadastro`, cujo INSERT de
-- permissão não pegou nada: ele casava `perfis.nome = 'Administrador'`, nome que
-- não existe nesta plataforma — os perfis de administração se chamam
-- "Administrador Empresa" e "Administrador da Plataforma". A migration modelo
-- que serviu de base (`20260905181000_perm_produtos_campos`) tem o mesmo
-- defeito; quem concedeu as permissões dela foi o `seed-base.ts`, que dá as 9
-- ações de todas as rotinas a quem é `sistemaBase`.
--
-- Por isso aqui o critério é `sistemaBase`, não o nome: é o que define o perfil
-- com acesso total dentro da empresa, e é o mesmo que o seed usa numa base
-- criada do zero.
--
-- Os demais perfis (Diretor, Administrativo, Gerente…) ficam de fora de
-- propósito: quem mantém o cadastro de produtos é decisão do cliente, na tela
-- de Perfis. Sem isto o menu "Produtos" de Cadastros nasceria invisível até
-- para o administrador, porque a barra lateral é montada pelas permissões
-- gravadas — inclusive as de quem é `sistemaBase`.

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
WHERE r."codigo" = 'produtos-cadastro'
  AND p."sistemaBase" = true
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

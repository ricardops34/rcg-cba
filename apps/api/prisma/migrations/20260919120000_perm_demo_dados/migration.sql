-- Rotina "Base de Demonstração" (`demo-dados`): popular uma empresa com dado
-- fictício e limpar o dado de negócio dela, pelo detalhe da empresa em
-- Administração > Empresas.
--
-- **Rotina sem tela própria** (ROTINAS_SEM_TELA no catálogo): não gera item de
-- menu, existe só para o RBAC, e fica pendurada no menu de Empresas — que é
-- onde a capacidade aparece. Por isso esta migration cria a rotina e **não**
-- cria menu.
--
-- Por que a migration cria a rotina, se estrutura mora em
-- `catalogo-sistema.ts`: a ordem de deploy é `migrate deploy` e só depois
-- `sincronizar-catalogo` (ver docs/runbook-operacao.md). Uma migration que só
-- concedesse a permissão não encontraria a rotina — ela ainda não existiria —
-- e sairia sem fazer nada, deixando a capacidade inacessível para todo mundo
-- até alguém marcá-la à mão na tela de Perfis.
--
-- Id e código são os mesmos do catálogo, e os dois lados são idempotentes
-- (`ON CONFLICT DO NOTHING` aqui, `upsert` lá): quem rodar o script depois não
-- encontra nada a fazer.
--
-- Base nova não passa por aqui: o `seed-base.ts` aplica o catálogo e concede
-- todas as ações de todas as rotinas aos dois perfis de administrador.

-- O `WHERE EXISTS` não é zelo excessivo: sem ele esta migration **derruba a
-- criação de uma base do zero**. Ali a ordem é `migrate deploy` e só depois o
-- seed, então `menus` ainda está vazia quando isto roda, e o INSERT morreria na
-- chave estrangeira (`rotinas_menuId_fkey`) levando o deploy inteiro junto. O
-- `ON CONFLICT` abaixo não cobre esse caso — ele trata chave duplicada, não
-- referência ausente.
INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-demo-dados',
  'seed-menu-empresas',
  'Base de Demonstração',
  'demo-dados',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-empresas')
ON CONFLICT ("codigo") DO NOTHING;

-- Quem recebe: **só os perfis de administrador**, e todas as ações — é o mesmo
-- estado em que uma base nova nasce (o seed concede ACOES inteiro a eles), então
-- base existente e base nova terminam iguais.
--
-- O nome antigo 'Administrador' entra na lista por causa das bases anteriores à
-- migration `20260909120000_perfis_admin_plataforma`, que o separou em
-- 'Administrador da Plataforma' e 'Administrador Empresa'.
--
-- **Diretor fica de fora de propósito.** Quem quiser dar a alguém mais marca na
-- tela de Perfis — e `demo-dados.excluir` apaga o cadastro real da empresa,
-- então é decisão para se tomar olhando.
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
CROSS JOIN (VALUES
  ('visualizar'), ('cadastrar'), ('editar'), ('excluir'), ('importar'),
  ('exportar'), ('aprovar'), ('cancelar'), ('bloquear')
) AS a("acao")
WHERE r."codigo" = 'demo-dados'
  AND p."nome" IN ('Administrador da Plataforma', 'Administrador Empresa', 'Administrador')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

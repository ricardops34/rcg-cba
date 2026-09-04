-- Rotina "Meus Atendimentos" (linha do tempo do atendimento do vendedor):
-- concede `visualizar` aos perfis que atendem, numa base que já existe.
--
-- Por que a migration também **cria** o menu e a rotina, se estrutura mora em
-- `catalogo-sistema.ts`: a ordem de deploy é `migrate deploy` e só depois
-- `sincronizar-catalogo` (ver docs/runbook-operacao.md). Uma migration que só
-- concedesse a permissão não encontraria a rotina — ela ainda não existiria —
-- e sairia sem fazer nada, deixando a rotina invisível para todo mundo até
-- alguém marcá-la à mão na tela de Perfis.
--
-- Não há divergência entre as duas definições: os ids e o código são os
-- mesmos do catálogo, e os dois lados são idempotentes (`ON CONFLICT DO
-- NOTHING` aqui, `upsert` lá). Quem roda o script depois não encontra nada a
-- fazer.
--
-- Base nova não passa por aqui: o `seed-base.ts` aplica o catálogo e as
-- permissões de `VENDEDOR_PERMISSOES`, onde a rotina também está.

-- O `WHERE EXISTS` não é zelo excessivo: sem ele esta migration **derruba a
-- criação de uma base do zero**. Ali a ordem é `migrate deploy` e só depois o
-- seed, então `modulos` ainda está vazia quando isto roda, e o INSERT morre na
-- chave estrangeira (`menus_moduloId_fkey`) levando o deploy inteiro junto. O
-- `ON CONFLICT` abaixo não cobre esse caso — ele trata chave duplicada, não
-- referência ausente.
--
-- Numa base nova não há nada a fazer aqui mesmo: o `seed-base.ts` cria módulo,
-- menu, rotina e as permissões a partir do catálogo. Esta migration existe
-- para a base que **já roda** e não passaria pelo seed de novo.
INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-meus-atendimentos',
  'seed-modulo-comercial',
  'Meus Atendimentos',
  'history',
  '/comercial/meus-atendimentos',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-comercial'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-comercial')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-meus-atendimentos',
  'seed-menu-meus-atendimentos',
  'Meus Atendimentos',
  'meus-atendimentos',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-meus-atendimentos')
ON CONFLICT ("codigo") DO NOTHING;

-- Quem recebe: os perfis que atendem cliente. A tela é sempre do **próprio**
-- vendedor (a API não aceita pedir a de outro), então não há concessão de
-- alcance escondida aqui — quem não tem cadastro de vendedor vê a lista vazia.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  p."id",
  r."id",
  'visualizar'::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE r."codigo" = 'meus-atendimentos'
  AND p."nome" IN ('Administrador', 'Diretor', 'Gerente', 'Supervisor', 'Vendedor')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

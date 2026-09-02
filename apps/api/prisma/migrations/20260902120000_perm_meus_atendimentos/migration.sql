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

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-menu-meus-atendimentos',
  'seed-modulo-comercial',
  'Meus Atendimentos',
  'history',
  '/comercial/meus-atendimentos',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-comercial'),
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-rotina-meus-atendimentos',
  'seed-menu-meus-atendimentos',
  'Meus Atendimentos',
  'meus-atendimentos',
  true,
  now(),
  now()
)
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

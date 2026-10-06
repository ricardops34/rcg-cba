-- Rotina "Histórico do WhatsApp" (Gerencial) numa base que já existe.
--
-- A migration que devia ter feito isto (20261002120000_whatsapp_historico_permanente)
-- foi commitada vazia. Na produção a rotina nunca chegou ao banco — ela só
-- nasceria pelo `sincronizar-catalogo`, que não rodou depois — e por isso a
-- 20261005200000_perm_whatsapp_historico_excluir passou sem conceder nada:
-- não havia rotina para receber a permissão. Sintoma em 2026-10-05: o
-- administrador não via "Limpar conversas" nem "Excluir instância e
-- histórico", e o próprio menu Histórico do WhatsApp não aparecia.
--
-- Mesmo molde da 20260902120000_perm_meus_atendimentos: cria menu e rotina
-- com os ids e o código do catálogo (`ON CONFLICT DO NOTHING`; o
-- `sincronizar-catalogo` depois não encontra nada a fazer) e só então
-- concede. O `WHERE EXISTS` evita derrubar a criação de uma base do zero, onde
-- `modulos` ainda está vazia quando as migrations rodam.

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-whatsapp-historico',
  'seed-modulo-gerencial',
  'Histórico do WhatsApp',
  'history',
  '/gerencial/whatsapp',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-gerencial'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-gerencial')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-whatsapp-historico',
  'seed-menu-whatsapp-historico',
  'Histórico do WhatsApp',
  'whatsapp-historico',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-whatsapp-historico')
ON CONFLICT ("codigo") DO NOTHING;

-- Ler o histórico: os gestores, como no catálogo (SUPERVISAO_PERMISSOES para
-- Supervisor e Gerente; o Diretor recebe as rotinas fora da Administração).
-- Por nome, e não por id, porque cada grupo econômico tem a sua cópia de
-- Gerente e Supervisor (20260930200000_perfil_por_grupo). Vendedor fica de
-- fora: ele vê o próprio histórico no Atendimento.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", 'visualizar'::"Acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE r."codigo" = 'whatsapp-historico'
  AND p."deletedAt" IS NULL
  AND (p."sistemaBase" = true OR p."nome" IN ('Diretor', 'Gerente', 'Supervisor'))
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- Excluir histórico: só o administrador (decisão de 2026-10-05). Repete a
-- 20261005200000, que não achou a rotina; onde ela já tinha concedido, o
-- `ON CONFLICT` não duplica.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", 'excluir'::"Acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE r."codigo" = 'whatsapp-historico'
  AND p."sistemaBase" = true
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

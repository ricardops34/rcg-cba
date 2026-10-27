-- Acompanhamento da equipe (docs/planos/2026-10-27-acompanhamento-equipe.md).
--
-- Menu e rotina com os mesmos ids e códigos de `catalogo-sistema.ts`,
-- idempotentes dos dois lados (ver 20261013230000_modulo_relatorios): em
-- produção o `sincronizar-catalogo` roda depois do `migrate deploy`, e sem
-- criá-los aqui a concessão abaixo não acharia a rotina. O `WHERE EXISTS`
-- protege a base criada do zero, em que `modulos` ainda está vazia.

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT 'seed-menu-acompanhamento-equipe', 'seed-modulo-gerencial', 'Acompanhamento da Equipe',
       'activity', '/gerencial/acompanhamento', 99, true, now(), now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-gerencial')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT 'seed-rotina-acompanhamento-equipe', 'seed-menu-acompanhamento-equipe',
       'Acompanhamento da Equipe', 'acompanhamento-equipe', true, now(), now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-acompanhamento-equipe')
ON CONFLICT ("codigo") DO NOTHING;

-- Supervisor, Gerente e Diretor (pedido do usuário, 2026-10-27). Por nome, como
-- 20261013230000_modulo_relatorios: pega o perfil global e o de cada grupo
-- econômico. Os administradores (sistemaBase) já têm tudo pelo isAdmin.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", 'visualizar'::"Acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE r."codigo" = 'acompanhamento-equipe'
  AND p."nome" IN ('Supervisor', 'Gerente', 'Diretor')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- "Atualizar pela Receita" em lote para Gerente e Supervisor (decisão do usuário,
-- 2026-11-20). O lote passou a aceitar `clientes.importar` além de
-- `clientes.aprovar`; `importar` libera só o lote, sem a aprovação da fila de
-- alterações de cadastro. O escopo de carteira continua no serviço.
--
-- Por nome, como 20261119140000_perm_vendedor_condicoes_pagamento: pega o perfil
-- global e o de cada grupo econômico. Espelha SUPERVISAO_PERMISSOES em
-- `catalogo-sistema.ts`.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", 'importar'::"Acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE r."codigo" = 'clientes'
  AND p."nome" IN ('Supervisor', 'Gerente')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

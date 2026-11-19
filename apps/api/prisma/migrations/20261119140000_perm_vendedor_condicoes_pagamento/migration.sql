-- `condicoes-pagamento.visualizar` para Vendedor, Supervisor e Gerente
-- (bug reportado pelo usuário, 2026-11-19).
--
-- O seletor de condição de pagamento no orçamento chama
-- GET /condicoes-pagamento, que exige essa permissão. Vendedor nunca a teve;
-- Supervisor/Gerente herdam de VENDEDOR_PERMISSOES e também ficaram sem. Na
-- prática o seletor ficava vazio (só "Sem condição" + a condição já gravada
-- no cliente, injetada à parte sem passar pela API) para esses três perfis;
-- só Admin via a lista completa.
--
-- Por nome, como 20261116120000_perm_supervisao_aprovar_orcamentos: pega o
-- perfil global e o de cada grupo econômico. Os administradores (sistemaBase)
-- já têm tudo. Espelha VENDEDOR_PERMISSOES em `catalogo-sistema.ts`.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", 'visualizar'::"Acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE r."codigo" = 'condicoes-pagamento'
  AND p."nome" IN ('Vendedor', 'Supervisor', 'Gerente')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

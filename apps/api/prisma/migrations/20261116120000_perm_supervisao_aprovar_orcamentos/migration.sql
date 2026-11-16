-- "Aprovar" em Orçamentos para Supervisor e Gerente (decisão do usuário,
-- 2026-11-16).
--
-- O pedido de liberação de desconto vai para o superior direto do vendedor,
-- mas nenhum dos dois perfis tinha a ação que autoriza e recusa — o superior
-- recebia o aviso e não via nem os botões nem o filtro "Bloqueados por
-- desconto". Em Orçamentos, "aprovar" só libera isso (autorizar/recusar
-- desconto); efetivar o orçamento continua sendo "editar".
--
-- Por nome, como 20261027140000_acompanhamento_equipe: pega o perfil global e
-- o de cada grupo econômico. Os administradores (sistemaBase) já têm tudo.
-- Espelha SUPERVISAO_PERMISSOES em `catalogo-sistema.ts`.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", 'aprovar'::"Acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE r."codigo" = 'orcamentos'
  AND p."nome" IN ('Supervisor', 'Gerente')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- Move o item de menu "Clientes" de Comercial para Cadastros e acompanha a
-- mudança da rota no front (a pasta da tela saiu de (app)/comercial/clientes
-- para (app)/cadastros/clientes).
--
-- Migration de dados, não de schema: o menu é semeado por seed-base.ts, que é
-- destrutivo e não roda em produção. Sem isto o stack de produção continuaria
-- com o item em Comercial apontando pra uma rota que não existe mais.
-- Idempotente e restrita ao registro semeado.

UPDATE "menus"
SET "moduloId" = 'seed-modulo-cadastros',
    "rota" = '/cadastros/clientes',
    "updatedAt" = now()
WHERE "id" = 'seed-menu-clientes';

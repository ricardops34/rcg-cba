-- Módulo de Relatórios (docs/planos/2026-10-13-modulo-relatorios.md).
--
-- Módulo, menus e rotinas com os mesmos ids e códigos de `catalogo-sistema.ts`,
-- idempotentes dos dois lados: em produção o `sincronizar-catalogo` roda
-- **depois** do `migrate deploy`, e sem criá-los aqui a concessão abaixo não
-- acharia as rotinas e não concederia nada. O `WHERE EXISTS` protege a base
-- criada do zero, em que `modulos` ainda está vazia quando as migrations rodam
-- (o seed cria tudo, com as permissões, depois).

INSERT INTO "modulos" ("id", "nome", "icone", "ordem", "ativo", "createdAt", "updatedAt")
SELECT 'seed-modulo-relatorios', 'Relatórios', 'file-text', 6, true, now(), now()
WHERE EXISTS (SELECT 1 FROM "modulos")
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT m.id, 'seed-modulo-relatorios', m.nome, m.icone, m.rota, m.ordem, true, now(), now()
FROM (VALUES
  ('seed-menu-relatorio-compras', 'Compras', 'package-plus', '/relatorios/compras', 1),
  ('seed-menu-relatorio-vendas', 'Vendas por vendedor', 'receipt', '/relatorios/vendas', 2),
  ('seed-menu-relatorio-estoque-compra', 'Estoque e compra', 'boxes', '/relatorios/estoque-compra', 3)
) AS m(id, nome, icone, rota, ordem)
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-relatorios')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT r.id, r.menu, r.nome, r.codigo, true, now(), now()
FROM (VALUES
  ('seed-rotina-relatorio-compras', 'seed-menu-relatorio-compras', 'Compras', 'relatorio-compras'),
  ('seed-rotina-relatorio-vendas', 'seed-menu-relatorio-vendas', 'Vendas por vendedor', 'relatorio-vendas'),
  ('seed-rotina-relatorio-estoque-compra', 'seed-menu-relatorio-estoque-compra', 'Estoque e compra', 'relatorio-estoque-compra')
) AS r(id, menu, nome, codigo)
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = r.menu)
ON CONFLICT ("codigo") DO NOTHING;

-- Quem recebe (decisão do usuário, 2026-10-13): Gerente e Administrativo. Os
-- administradores (sistemaBase) já têm tudo pelo isAdmin. O Diretor não foi
-- pedido. Por nome, como 20261007033504_equipamentos_comodato — pega o Gerente
-- global e o de cada grupo econômico.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", r."id", a."acao"::"Acao", true, now(), now()
FROM "perfis" p
CROSS JOIN "rotinas" r
CROSS JOIN (VALUES ('visualizar'), ('exportar')) AS a("acao")
WHERE r."codigo" IN ('relatorio-compras', 'relatorio-vendas', 'relatorio-estoque-compra')
  AND p."nome" IN ('Gerente', 'Administrativo')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

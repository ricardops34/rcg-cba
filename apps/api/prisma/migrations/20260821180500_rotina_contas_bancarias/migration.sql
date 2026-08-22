-- Menu e rotina do cadastro de Contas Bancárias (convênio de cobrança da 2ª
-- via de boleto).
--
-- Por que numa migration e não no seed: `seed-base.ts` **apaga todos os dados
-- de negócio** antes de repovoar — rodá-lo numa base com dados importados
-- seria destruir a base. O seed também foi atualizado, para a base criada do
-- zero.
--
-- `menus`, `rotinas` e `perfil_permissoes` são tabelas de sistema, sem
-- `empresaId` e sem RLS (ver prisma/migrations/README.md).

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-menu-contas-bancarias', 'seed-modulo-administracao', 'Contas Bancárias',
  'landmark', '/admin/contas-bancarias', 105, true, NOW(), NOW()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-rotina-contas-bancarias', 'seed-menu-contas-bancarias', 'Contas Bancárias',
  'contas-bancarias', true, NOW(), NOW()
)
ON CONFLICT ("codigo") DO NOTHING;

-- Só o Administrador. Dado bancário errado não produz erro visível na tela:
-- produz boleto que o cliente tenta pagar e o banco recusa.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text, p."id", 'seed-rotina-contas-bancarias', a."acao"::"Acao", true, NOW(), NOW()
FROM "perfis" p
CROSS JOIN (VALUES ('visualizar'), ('cadastrar'), ('editar'), ('excluir')) AS a("acao")
WHERE p."nome" = 'Administrador' AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

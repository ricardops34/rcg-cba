-- Menu e rotina do cadastro de Comunicados (mural da tela inicial).
--
-- Por que numa migration e não no seed: `seed-base.ts` **apaga todos os dados
-- de negócio** antes de repovoar (ver o cabeçalho dele) — rodá-lo numa base
-- com dados importados seria destruir a base. A estrutura de menu que ele
-- monta por upsert precisa, então, ser replicada aqui para as bases que já
-- existem. O seed também foi atualizado, para a base criada do zero.
--
-- `menus`, `rotinas` e `perfil_permissoes` são tabelas de sistema, sem
-- `empresaId` e sem RLS (ver prisma/migrations/README.md).

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-menu-comunicados', 'seed-modulo-administracao', 'Comunicados',
  'megaphone', '/admin/comunicados', 104, true, NOW(), NOW()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-rotina-comunicados', 'seed-menu-comunicados', 'Comunicados', 'comunicados',
  true, NOW(), NOW()
)
ON CONFLICT ("codigo") DO NOTHING;

-- Só o perfil Administrador recebe as quatro ações. Os demais perfis ficam de
-- fora de propósito: publicar aviso para a empresa inteira é decisão de quem
-- administra, e conceder depois é um clique na tela de Perfis. Ler o mural não
-- depende disto — a rota do mural não exige permissão (ver InicioController).
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text, p."id", 'seed-rotina-comunicados', a."acao"::"Acao", true, NOW(), NOW()
FROM "perfis" p
CROSS JOIN (VALUES ('visualizar'), ('cadastrar'), ('editar'), ('excluir')) AS a("acao")
WHERE p."nome" = 'Administrador' AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

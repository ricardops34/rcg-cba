-- Equipamentos de comodato (ver docs/planos/equipamentos-comodato.md): o
-- cabeçalho do cadastro mestre-detalhe. Os itens — os produtos aplicáveis —
-- são a relação `aplicacao` de `produto_relacionados`, que já existe.

-- CreateTable
CREATE TABLE "equipamentos_comodato" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,
    CONSTRAINT "equipamentos_comodato_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "equipamentos_comodato_produtoId_key" ON "equipamentos_comodato"("produtoId");
-- CreateIndex
CREATE INDEX "equipamentos_comodato_empresaId_idx" ON "equipamentos_comodato"("empresaId");
-- AddForeignKey
ALTER TABLE "equipamentos_comodato" ADD CONSTRAINT "equipamentos_comodato_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "equipamentos_comodato" ADD CONSTRAINT "equipamentos_comodato_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "equipamentos_comodato" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_equipamentos_comodato ON "equipamentos_comodato"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- Menu e rotina: os mesmos ids e código de `catalogo-sistema.ts`, idempotentes
-- dos dois lados. O `WHERE EXISTS` protege a criação de uma base do zero, em
-- que `modulos` ainda está vazia quando as migrations rodam (ver o modelo,
-- 20260902120000_perm_meus_atendimentos).
INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-equipamentos-comodato',
  'seed-modulo-cadastros',
  'Equipamentos de Comodato',
  'wrench',
  '/cadastros/equipamentos-comodato',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-cadastros'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-cadastros')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-equipamentos-comodato',
  'seed-menu-equipamentos-comodato',
  'Equipamentos de Comodato',
  'equipamentos-comodato',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-equipamentos-comodato')
ON CONFLICT ("codigo") DO NOTHING;

-- Quem recebe (decisão do usuário, 2026-10-07): administradores, Diretor,
-- Gerente e Supervisor. `importar` é o "popular pelas notas".
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  p."id",
  r."id",
  a."acao"::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN "rotinas" r
CROSS JOIN (VALUES ('visualizar'), ('cadastrar'), ('editar'), ('excluir'), ('importar')) AS a("acao")
WHERE r."codigo" = 'equipamentos-comodato'
  AND p."nome" IN ('Administrador', 'Administrador da Plataforma', 'Administrador Empresa', 'Diretor', 'Gerente', 'Supervisor')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

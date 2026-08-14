-- Sugestão de compra: produto que clientes semelhantes compram e o alvo não.
-- Dois motores gravam aqui — o determinístico (SQL sobre cesta + CNAE) e o de
-- IA —, distinguidos por `origem`.

-- CreateEnum
CREATE TYPE "OrigemSugestaoCompra" AS ENUM ('local', 'ia');

-- CreateTable
CREATE TABLE "sugestoes_compra" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "origem" "OrigemSugestaoCompra" NOT NULL DEFAULT 'local',
    "ordem" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "motivo" TEXT,
    "modelo" TEXT,
    "loteId" TEXT NOT NULL,
    "geradaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sugestoes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sugestoes_compra_empresaId_clienteId_origem_ordem_idx" ON "sugestoes_compra"("empresaId", "clienteId", "origem", "ordem");

-- CreateIndex
CREATE INDEX "sugestoes_compra_empresaId_loteId_idx" ON "sugestoes_compra"("empresaId", "loteId");

-- CreateIndex
CREATE UNIQUE INDEX "sugestoes_compra_clienteId_produtoId_origem_key" ON "sugestoes_compra"("clienteId", "produtoId", "origem");

-- AddForeignKey
ALTER TABLE "sugestoes_compra" ADD CONSTRAINT "sugestoes_compra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestoes_compra" ADD CONSTRAINT "sugestoes_compra_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestoes_compra" ADD CONSTRAINT "sugestoes_compra_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A montagem da cesta de compras varre (empresaId, clienteId, produtoId) em
-- notas_saida_itens, que só tinha índice por (empresaId, produtoId) e
-- (empresaId, vendedorId, dtEmissao) — sem este, cada cliente-alvo faria um
-- seq scan na maior tabela da base.
CREATE INDEX "notas_saida_itens_empresaId_clienteId_produtoId_idx"
  ON "notas_saida_itens" ("empresaId", "clienteId", "produtoId");

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "sugestoes_compra" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_sugestoes_compra ON "sugestoes_compra"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- Menu/rotina da tela de Sugestão de Compra, em Consultas.
INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-menu-sugestao-compra',
  'seed-modulo-consultas',
  'Sugestão de Compra',
  'lightbulb',
  '/consultas/sugestao-compra',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-consultas'),
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-rotina-sugestao-compra',
  'seed-menu-sugestao-compra',
  'Sugestão de Compra',
  'sugestao-compra',
  true,
  now(),
  now()
)
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  'seed-perm-sugestao-compra-' || p."id" || '-' || a."acao",
  p."id",
  'seed-rotina-sugestao-compra',
  a."acao"::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN (
  SELECT unnest(ARRAY[
    'visualizar', 'cadastrar', 'editar', 'excluir',
    'importar', 'exportar', 'aprovar', 'cancelar', 'bloquear'
  ]) AS "acao"
) a
WHERE p."nome" = 'Administrador'
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- Produtos relacionados: similares e aplicação.
--
-- Uma tabela só para os dois casos, porque a pergunta é a mesma ("que outros
-- produtos têm a ver com este?") e o que muda é o `tipo`:
--
-- - `similar` é **simétrica** (se A substitui B, B substitui A). Guardada uma
--   vez e lida dos dois lados — duas linhas para o mesmo fato divergiriam na
--   primeira vez que alguém apagasse uma.
-- - `aplicacao` é **direcional**: a dosadora em comodato usa os químicos que
--   ela dilui, e do lado do químico a leitura é "usado em".
--
-- Nada aqui vem do ERP: é conhecimento de quem vende.

-- CreateEnum
CREATE TYPE "ProdutoRelacaoTipo" AS ENUM ('similar', 'aplicacao');

-- CreateTable
CREATE TABLE "produto_relacionados" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "relacionadoId" TEXT NOT NULL,
    "tipo" "ProdutoRelacaoTipo" NOT NULL,
    "observacao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "produto_relacionados_pkey" PRIMARY KEY ("id")
);

-- A consulta pela ponta de destino é tão comum quanto pela de origem: é ela que
-- responde "em que equipamentos este químico é usado".
-- CreateIndex
CREATE INDEX "produto_relacionados_empresaId_relacionadoId_tipo_idx" ON "produto_relacionados"("empresaId", "relacionadoId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "produto_relacionados_empresaId_produtoId_relacionadoId_tipo_key" ON "produto_relacionados"("empresaId", "produtoId", "relacionadoId", "tipo");

-- AddForeignKey
ALTER TABLE "produto_relacionados" ADD CONSTRAINT "produto_relacionados_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Apagar qualquer uma das pontas leva a relação junto: relação com produto que
-- não existe mais não significa nada.
-- AddForeignKey
ALTER TABLE "produto_relacionados" ADD CONSTRAINT "produto_relacionados_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_relacionados" ADD CONSTRAINT "produto_relacionados_relacionadoId_fkey" FOREIGN KEY ("relacionadoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "produto_relacionados" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_produto_relacionados ON "produto_relacionados"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "produto_relacionados" TO plataforma_app;

-- Campos complementares de produto: a empresa define quais dados extras quer
-- guardar (dimensões, peso bruto, regra de diluição, validade, tensão…) e
-- preenche por produto.
--
-- Duas tabelas porque são duas coisas diferentes: `produto_campos` é o
-- **cadastro** da definição (nome, tipo, unidade, ordem) e `produto_campo_valores`
-- é o preenchimento. Ver os comentários em schema.prisma para o porquê de não
-- serem colunas novas em `produtos`.
--
-- O import do ERP não toca em nenhuma das duas: ele faz upsert em `produtos`
-- por `codigoErp`, e o que a empresa digitou aqui sobrevive à próxima carga.

-- CreateEnum
CREATE TYPE "ProdutoCampoTipo" AS ENUM ('texto', 'texto_longo', 'numero', 'booleano', 'data', 'lista');

-- CreateTable
CREATE TABLE "produto_campos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "ProdutoCampoTipo" NOT NULL DEFAULT 'texto',
    "unidade" TEXT,
    "opcoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "grupo" TEXT,
    "ajuda" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "visivelAgente" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "produto_campos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto_campo_valores" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "campoId" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "produto_campo_valores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "produto_campos_empresaId_ativo_ordem_idx" ON "produto_campos"("empresaId", "ativo", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "produto_campos_empresaId_chave_key" ON "produto_campos"("empresaId", "chave");

-- O índice por valor é o que faz "quais produtos têm diluição 1:100" ser uma
-- busca, e não uma varredura da tabela inteira de valores.
-- CreateIndex
CREATE INDEX "produto_campo_valores_empresaId_campoId_valor_idx" ON "produto_campo_valores"("empresaId", "campoId", "valor");

-- CreateIndex
CREATE UNIQUE INDEX "produto_campo_valores_empresaId_produtoId_campoId_key" ON "produto_campo_valores"("empresaId", "produtoId", "campoId");

-- AddForeignKey
ALTER TABLE "produto_campos" ADD CONSTRAINT "produto_campos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_campo_valores" ADD CONSTRAINT "produto_campo_valores_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Apagar o produto ou a definição do campo leva os valores junto: valor órfão
-- não significa nada — ninguém sabe de que produto era nem o que media.
-- AddForeignKey
ALTER TABLE "produto_campo_valores" ADD CONSTRAINT "produto_campo_valores_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_campo_valores" ADD CONSTRAINT "produto_campo_valores_campoId_fkey" FOREIGN KEY ("campoId") REFERENCES "produto_campos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "produto_campos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "produto_campo_valores" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_produto_campos ON "produto_campos"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY tenant_isolation_produto_campo_valores ON "produto_campo_valores"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "produto_campos" TO plataforma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "produto_campo_valores" TO plataforma_app;

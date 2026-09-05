-- Fila de importação em lote de fichas técnicas.
--
-- O vínculo é pelo **conteúdo** do PDF, não pelo nome do arquivo — é a
-- diferença para a importação de fotos, que casa pelo nome: o fabricante manda
-- a ficha com o nome de catálogo dele, e o código que interessa está impresso
-- na página.
--
-- Quem lê é o modelo; quem procura no catálogo é o servidor. O modelo devolve o
-- que está escrito no documento (código do fabricante, nome do produto) e o
-- servidor busca — se ele devolvesse um id, bastaria alucinar um para pendurar
-- a ficha no produto errado.
--
-- A fila vive em tabela porque o processamento é lento e pago: cada PDF é uma
-- chamada ao provedor. Um lote de 80 arquivos não cabe numa requisição HTTP, e
-- um reinício no meio não pode perder o que já foi feito.

-- CreateEnum
CREATE TYPE "FichaImportacaoSituacao" AS ENUM ('pendente', 'processando', 'vinculada', 'sem_correspondencia', 'ambiguo', 'erro');

-- CreateTable
CREATE TABLE "produto_ficha_importacoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "situacao" "FichaImportacaoSituacao" NOT NULL DEFAULT 'pendente',
    "codigoDetectado" TEXT,
    "nomeDetectado" TEXT,
    "titulo" TEXT,
    "markdown" TEXT,
    "produtoId" TEXT,
    "fichaId" TEXT,
    "erro" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "processadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "produto_ficha_importacoes_pkey" PRIMARY KEY ("id")
);

-- É o índice que a varredura usa para achar o próximo pendente.
-- CreateIndex
CREATE INDEX "produto_ficha_importacoes_empresaId_situacao_createdAt_idx" ON "produto_ficha_importacoes"("empresaId", "situacao", "createdAt");

-- AddForeignKey
ALTER TABLE "produto_ficha_importacoes" ADD CONSTRAINT "produto_ficha_importacoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sem FK para `produtos` e `produto_fichas` de propósito: as duas colunas são o
-- **resultado** da importação, e apagar o produto depois não deve derrubar o
-- registro de que aquele arquivo foi processado.

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "produto_ficha_importacoes" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_produto_ficha_importacoes ON "produto_ficha_importacoes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "produto_ficha_importacoes" TO plataforma_app;

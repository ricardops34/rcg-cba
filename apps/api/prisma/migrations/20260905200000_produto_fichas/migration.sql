-- Ficha técnica do produto e anexo do assistente interno.
--
-- `produto_fichas` guarda o PDF do fabricante **e** o Markdown extraído dele,
-- porque os dois têm leitores diferentes: o PDF é para o vendedor abrir e
-- mandar ao cliente, o Markdown é o que a IA lê ao falar do produto. O PDF é
-- lido uma vez, no anexo; nenhum modelo o recebe de novo a cada pergunta.
--
-- `agente_anexos` é o arquivo que alguém anexou a uma mensagem do assistente.
-- Fica em tabela, e não solto em disco, para o RLS prendê-lo à empresa, o
-- `usuarioId` impedir que uma conversa use o anexo de outra pessoa e o
-- `consumidoEm` registrar que ele já virou ficha ou foto.

-- CreateTable
CREATE TABLE "produto_fichas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "visivelAgente" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "produto_fichas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_anexos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "consumidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agente_anexos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "produto_fichas_empresaId_produtoId_idx" ON "produto_fichas"("empresaId", "produtoId");

-- CreateIndex
CREATE INDEX "agente_anexos_empresaId_usuarioId_createdAt_idx" ON "agente_anexos"("empresaId", "usuarioId", "createdAt");

-- AddForeignKey
ALTER TABLE "produto_fichas" ADD CONSTRAINT "produto_fichas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_fichas" ADD CONSTRAINT "produto_fichas_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_anexos" ADD CONSTRAINT "agente_anexos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "produto_fichas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agente_anexos" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_produto_fichas ON "produto_fichas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY tenant_isolation_agente_anexos ON "agente_anexos"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "produto_fichas" TO plataforma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "agente_anexos" TO plataforma_app;

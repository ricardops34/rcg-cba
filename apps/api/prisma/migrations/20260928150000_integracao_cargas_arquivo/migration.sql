-- Carga por arquivo (docs/planos/2026-09-28-carga-por-arquivo.md): o ERP sobe
-- um arquivo JSON Lines e a API o aplica em segundo plano.

-- CreateEnum
CREATE TYPE "IntegracaoCargaSituacao" AS ENUM ('recebida', 'processando', 'concluida', 'cancelada', 'erro');

-- CreateTable
CREATE TABLE "integracao_cargas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "descricao" TEXT,
    "arquivo" BYTEA NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "entidades" JSONB NOT NULL,
    "situacao" "IntegracaoCargaSituacao" NOT NULL DEFAULT 'recebida',
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "linhasProcessadas" INTEGER NOT NULL DEFAULT 0,
    "ultimaLinha" INTEGER NOT NULL DEFAULT 0,
    "criados" INTEGER NOT NULL DEFAULT 0,
    "atualizados" INTEGER NOT NULL DEFAULT 0,
    "excluidos" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "mensagem" TEXT,
    "cancelarSolicitado" BOOLEAN NOT NULL DEFAULT false,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "iniciadaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integracao_cargas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integracao_carga_erros" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "cargaId" TEXT NOT NULL,
    "linha" INTEGER NOT NULL,
    "entidade" TEXT NOT NULL,
    "chave" TEXT,
    "mensagem" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integracao_carga_erros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integracao_cargas_empresaId_situacao_createdAt_idx" ON "integracao_cargas"("empresaId", "situacao", "createdAt");

-- CreateIndex
CREATE INDEX "integracao_carga_erros_cargaId_linha_idx" ON "integracao_carga_erros"("cargaId", "linha");

-- AddForeignKey
ALTER TABLE "integracao_cargas" ADD CONSTRAINT "integracao_cargas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao_carga_erros" ADD CONSTRAINT "integracao_carga_erros_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao_carga_erros" ADD CONSTRAINT "integracao_carga_erros_cargaId_fkey" FOREIGN KEY ("cargaId") REFERENCES "integracao_cargas"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "integracao_cargas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_integracao_cargas ON "integracao_cargas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

ALTER TABLE "integracao_carga_erros" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_integracao_carga_erros ON "integracao_carga_erros"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

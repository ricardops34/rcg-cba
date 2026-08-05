-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN "codigoLegado" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_empresaId_codigoLegado_key" ON "orcamentos"("empresaId", "codigoLegado");

-- CreateTable
CREATE TABLE "integracao_api_keys" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "chaveHash" TEXT NOT NULL,
    "prefixo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "expiraEm" TIMESTAMP(3),
    "ultimoUso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "integracao_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integracao_api_keys_chaveHash_key" ON "integracao_api_keys"("chaveHash");

-- CreateIndex
CREATE INDEX "integracao_api_keys_empresaId_idx" ON "integracao_api_keys"("empresaId");

-- AddForeignKey
ALTER TABLE "integracao_api_keys" ADD CONSTRAINT "integracao_api_keys_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sem RLS de propósito: o ApiKeyGuard consulta esta tabela por "chaveHash"
-- antes de existir empresaId de contexto (é essa consulta que descobre o
-- tenant) — mesma exceção documentada para "refresh_tokens" em
-- apps/api/prisma/migrations/README.md.

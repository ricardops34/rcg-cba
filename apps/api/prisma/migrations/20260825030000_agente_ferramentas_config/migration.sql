
-- AlterTable
ALTER TABLE "agente_config" ADD COLUMN     "nomeAgente" TEXT NOT NULL DEFAULT 'Assistente';

-- CreateTable
CREATE TABLE "agente_ferramentas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "nome" TEXT,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "agente_ferramentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_ferramenta_perfis" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ferramentaId" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agente_ferramenta_perfis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agente_ferramentas_empresaId_chave_key" ON "agente_ferramentas"("empresaId", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "agente_ferramenta_perfis_ferramentaId_perfilId_key" ON "agente_ferramenta_perfis"("ferramentaId", "perfilId");

-- AddForeignKey
ALTER TABLE "agente_ferramentas" ADD CONSTRAINT "agente_ferramentas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_ferramenta_perfis" ADD CONSTRAINT "agente_ferramenta_perfis_ferramentaId_fkey" FOREIGN KEY ("ferramentaId") REFERENCES "agente_ferramentas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_ferramenta_perfis" ADD CONSTRAINT "agente_ferramenta_perfis_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "perfis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-Level Security por empresa (multi-tenant), consistente com as demais
-- tabelas de negócio. Ver prisma/migrations/README.md.
--
-- `agente_ferramenta_perfis` carrega `empresaId` justamente para poder ter a
-- policy própria: sem ela, o corte por tenant dependeria só do JOIN com
-- `agente_ferramentas`, e um SQL manual que esquecesse o JOIN veria as linhas
-- de todas as empresas.

ALTER TABLE "agente_ferramentas" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_agente_ferramentas ON "agente_ferramentas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

ALTER TABLE "agente_ferramenta_perfis" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_agente_ferramenta_perfis ON "agente_ferramenta_perfis"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

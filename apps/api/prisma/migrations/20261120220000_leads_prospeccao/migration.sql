-- Prospecção de leads pela base da Receita (docs/planos/2026-11-20-prospeccao-leads-receita.md):
-- o lead ganha origem e dados da empresa; coletas, distribuições e CNAEs do lead;
-- atividades e orçamentos passam a poder apontar para um lead.
--
-- Escrita à mão a partir do `prisma migrate diff`: o diff da base de dev traz também
-- diferenças antigas (tabelas wa_*, colunas de usuario_empresas) que não são desta mudança.

-- CreateEnum
CREATE TYPE "LeadOrigem" AS ENUM ('whatsapp', 'receita', 'manual');

-- CreateEnum
CREATE TYPE "LeadColetaSituacao" AS ENUM ('rodando', 'concluida', 'erro');

-- CreateEnum
CREATE TYPE "LeadDistribuicaoModo" AS ENUM ('regiao', 'manual');

-- AlterTable
ALTER TABLE "atividades" ADD COLUMN     "leadId" TEXT;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "capitalSocial" DECIMAL(18,2),
ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "cnpj" TEXT,
ADD COLUMN     "coletaId" TEXT,
ADD COLUMN     "coletadoEm" TIMESTAMP(3),
ADD COLUMN     "coletadoPor" TEXT,
ADD COLUMN     "convertidoEm" TIMESTAMP(3),
ADD COLUMN     "dadosReceita" JSONB,
ADD COLUMN     "dataAbertura" DATE,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "naturezaJuridica" TEXT,
ADD COLUMN     "nomeFantasia" TEXT,
ADD COLUMN     "origem" "LeadOrigem" NOT NULL DEFAULT 'whatsapp',
ADD COLUMN     "porte" TEXT,
ADD COLUMN     "primeiroAtendimentoEm" TIMESTAMP(3),
ADD COLUMN     "razaoSocial" TEXT,
ADD COLUMN     "situacaoCadastral" TEXT,
ADD COLUMN     "telefone2" TEXT,
ALTER COLUMN "telefone" DROP NOT NULL,
ALTER COLUMN "interesse" DROP NOT NULL;

-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN     "leadId" TEXT;

-- CreateTable
CREATE TABLE "lead_cnaes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "lead_cnaes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_coletas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "filtros" JSONB NOT NULL,
    "fonte" TEXT NOT NULL,
    "situacao" "LeadColetaSituacao" NOT NULL DEFAULT 'rodando',
    "encontrados" INTEGER NOT NULL DEFAULT 0,
    "jaClientes" INTEGER NOT NULL DEFAULT 0,
    "jaLeads" INTEGER NOT NULL DEFAULT 0,
    "inativos" INTEGER NOT NULL DEFAULT 0,
    "importados" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidaEm" TIMESTAMP(3),

    CONSTRAINT "lead_coletas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_distribuicoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "deVendedorId" TEXT,
    "paraVendedorId" TEXT,
    "distribuidoPor" TEXT NOT NULL,
    "modo" "LeadDistribuicaoModo" NOT NULL,
    "regiaoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_distribuicoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_cnaes_empresaId_codigo_idx" ON "lead_cnaes"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "lead_cnaes_leadId_codigo_key" ON "lead_cnaes"("leadId", "codigo");

-- CreateIndex
CREATE INDEX "lead_coletas_empresaId_iniciadaEm_idx" ON "lead_coletas"("empresaId", "iniciadaEm");

-- CreateIndex
CREATE INDEX "lead_distribuicoes_empresaId_leadId_createdAt_idx" ON "lead_distribuicoes"("empresaId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_distribuicoes_empresaId_paraVendedorId_createdAt_idx" ON "lead_distribuicoes"("empresaId", "paraVendedorId", "createdAt");

-- CreateIndex
CREATE INDEX "atividades_empresaId_leadId_idx" ON "atividades"("empresaId", "leadId");

-- CreateIndex
CREATE INDEX "leads_empresaId_origem_idx" ON "leads"("empresaId", "origem");

-- CreateIndex
CREATE INDEX "leads_empresaId_clienteId_idx" ON "leads"("empresaId", "clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_empresaId_cnpj_key" ON "leads"("empresaId", "cnpj");

-- CreateIndex
CREATE INDEX "orcamentos_empresaId_leadId_idx" ON "orcamentos"("empresaId", "leadId");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_coletaId_fkey" FOREIGN KEY ("coletaId") REFERENCES "lead_coletas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_cnaes" ADD CONSTRAINT "lead_cnaes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_cnaes" ADD CONSTRAINT "lead_cnaes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_coletas" ADD CONSTRAINT "lead_coletas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_distribuicoes" ADD CONSTRAINT "lead_distribuicoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_distribuicoes" ADD CONSTRAINT "lead_distribuicoes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "lead_cnaes" TO plataforma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "lead_coletas" TO plataforma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "lead_distribuicoes" TO plataforma_app;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "lead_cnaes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_coletas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_distribuicoes" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_lead_cnaes ON "lead_cnaes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));
CREATE POLICY tenant_isolation_lead_coletas ON "lead_coletas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));
CREATE POLICY tenant_isolation_lead_distribuicoes ON "lead_distribuicoes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

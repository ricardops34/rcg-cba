-- CreateEnum
CREATE TYPE "EstagioOportunidade" AS ENUM ('prospeccao', 'qualificacao', 'proposta', 'negociacao', 'ganha', 'perdida');

-- CreateEnum
CREATE TYPE "TipoAtividade" AS ENUM ('ligacao', 'reuniao', 'email', 'visita', 'tarefa');

-- CreateTable
CREATE TABLE "oportunidades" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "estagio" "EstagioOportunidade" NOT NULL DEFAULT 'prospeccao',
    "valorPrevisto" DOUBLE PRECISION,
    "dataPrevisao" TIMESTAMP(3),
    "dataFechamento" TIMESTAMP(3),
    "motivoPerda" TEXT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "oportunidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atividades" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "oportunidadeId" TEXT,
    "vendedorId" TEXT NOT NULL,
    "tipo" "TipoAtividade" NOT NULL DEFAULT 'tarefa',
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "dataVencimento" TIMESTAMP(3),
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "dataConclusao" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "atividades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oportunidades_empresaId_vendedorId_idx" ON "oportunidades"("empresaId", "vendedorId");

-- CreateIndex
CREATE INDEX "oportunidades_empresaId_clienteId_idx" ON "oportunidades"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "oportunidades_empresaId_estagio_idx" ON "oportunidades"("empresaId", "estagio");

-- CreateIndex
CREATE INDEX "atividades_empresaId_vendedorId_idx" ON "atividades"("empresaId", "vendedorId");

-- CreateIndex
CREATE INDEX "atividades_empresaId_clienteId_idx" ON "atividades"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "atividades_empresaId_oportunidadeId_idx" ON "atividades"("empresaId", "oportunidadeId");

-- CreateIndex
CREATE INDEX "atividades_empresaId_dataVencimento_idx" ON "atividades"("empresaId", "dataVencimento");

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_oportunidadeId_fkey" FOREIGN KEY ("oportunidadeId") REFERENCES "oportunidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RowLevelSecurity
ALTER TABLE "oportunidades" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_oportunidades ON "oportunidades"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- RowLevelSecurity
ALTER TABLE "atividades" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_atividades ON "atividades"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

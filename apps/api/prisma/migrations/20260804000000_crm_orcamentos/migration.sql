-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('rascunho', 'enviado', 'aprovado', 'recusado', 'expirado');

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "oportunidadeId" TEXT,
    "condicaoPagamentoId" TEXT,
    "titulo" TEXT NOT NULL,
    "status" "StatusOrcamento" NOT NULL DEFAULT 'rascunho',
    "dataValidade" TIMESTAMP(3),
    "observacao" TEXT,
    "vlrTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamento_itens" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "vlrTabela" DOUBLE PRECISION,
    "vlrUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percDesconto" DOUBLE PRECISION,
    "vlrDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orcamento_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orcamentos_empresaId_vendedorId_idx" ON "orcamentos"("empresaId", "vendedorId");

-- CreateIndex
CREATE INDEX "orcamentos_empresaId_clienteId_idx" ON "orcamentos"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "orcamentos_empresaId_status_idx" ON "orcamentos"("empresaId", "status");

-- CreateIndex
CREATE INDEX "orcamento_itens_empresaId_produtoId_idx" ON "orcamento_itens"("empresaId", "produtoId");

-- CreateIndex
CREATE INDEX "orcamento_itens_orcamentoId_idx" ON "orcamento_itens"("orcamentoId");

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_oportunidadeId_fkey" FOREIGN KEY ("oportunidadeId") REFERENCES "oportunidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_condicaoPagamentoId_fkey" FOREIGN KEY ("condicaoPagamentoId") REFERENCES "condicoes_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "orcamentos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_orcamentos ON "orcamentos"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

ALTER TABLE "orcamento_itens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_orcamento_itens ON "orcamento_itens"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

/*
  Warnings:

  - You are about to drop the column `categoria` on the `produtos` table. All the data in the column will be lost.
  - You are about to drop the column `subCategoria` on the `produtos` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "produtos" DROP COLUMN "categoria",
DROP COLUMN "subCategoria",
ADD COLUMN     "armazemId" TEXT,
ADD COLUMN     "categoriaId" TEXT,
ADD COLUMN     "subCategoriaId" TEXT;

-- CreateTable
CREATE TABLE "estoques" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "armazemId" TEXT NOT NULL,
    "saldo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reserva" DOUBLE PRECISION,
    "custo" DOUBLE PRECISION,
    "ultimoPreco" DOUBLE PRECISION,
    "ultimaCompra" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "estoques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_saida" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoLegado" INTEGER,
    "clienteId" TEXT,
    "vendedorId" TEXT,
    "condicaoPagamentoId" TEXT,
    "numero" TEXT NOT NULL,
    "serie" TEXT,
    "especieFiscal" TEXT,
    "tipo" TEXT,
    "dtEmissao" TIMESTAMP(3),
    "ano" INTEGER,
    "mes" INTEGER,
    "vlrBruto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrMercadoria" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrItens" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrIcms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrIpi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrFrete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrDevolucao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chaveNfe" TEXT,
    "dtNfe" TIMESTAMP(3),
    "mensagem" TEXT,
    "comodato" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "notas_saida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_saida_itens" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "notaSaidaId" TEXT NOT NULL,
    "codigoLegado" INTEGER,
    "clienteId" TEXT,
    "vendedorId" TEXT,
    "produtoId" TEXT,
    "item" INTEGER,
    "dtEmissao" TIMESTAMP(3),
    "ano" INTEGER,
    "mes" INTEGER,
    "cfop" TEXT,
    "tipo" TEXT,
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrTabela" DOUBLE PRECISION,
    "percDesconto" DOUBLE PRECISION,
    "vlrDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantidadeDev" DOUBLE PRECISION,
    "vlrDev" DOUBLE PRECISION,
    "peso" DOUBLE PRECISION,
    "comodato" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "notas_saida_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "titulos_receber" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoLegado" INTEGER,
    "clienteId" TEXT,
    "vendedorId" TEXT,
    "numero" TEXT NOT NULL,
    "parcela" TEXT,
    "prefixo" TEXT,
    "tipo" TEXT,
    "emissao" TIMESTAMP(3),
    "vencimento" TIMESTAMP(3),
    "vencimentoReal" TIMESTAMP(3),
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saldo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acrescimo" DOUBLE PRECISION,
    "decrescimo" DOUBLE PRECISION,
    "dtBaixa" TIMESTAMP(3),
    "formaPgto" TEXT,
    "historico" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "titulos_receber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estoques_empresaId_armazemId_idx" ON "estoques"("empresaId", "armazemId");

-- CreateIndex
CREATE UNIQUE INDEX "estoques_empresaId_produtoId_armazemId_key" ON "estoques"("empresaId", "produtoId", "armazemId");

-- CreateIndex
CREATE INDEX "notas_saida_empresaId_numero_idx" ON "notas_saida"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "notas_saida_empresaId_vendedorId_ano_mes_idx" ON "notas_saida"("empresaId", "vendedorId", "ano", "mes");

-- CreateIndex
CREATE INDEX "notas_saida_empresaId_clienteId_idx" ON "notas_saida"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "notas_saida_empresaId_dtEmissao_idx" ON "notas_saida"("empresaId", "dtEmissao");

-- CreateIndex
CREATE UNIQUE INDEX "notas_saida_empresaId_codigoLegado_key" ON "notas_saida"("empresaId", "codigoLegado");

-- CreateIndex
CREATE INDEX "notas_saida_itens_notaSaidaId_idx" ON "notas_saida_itens"("notaSaidaId");

-- CreateIndex
CREATE INDEX "notas_saida_itens_empresaId_produtoId_idx" ON "notas_saida_itens"("empresaId", "produtoId");

-- CreateIndex
CREATE INDEX "notas_saida_itens_empresaId_vendedorId_dtEmissao_idx" ON "notas_saida_itens"("empresaId", "vendedorId", "dtEmissao");

-- CreateIndex
CREATE UNIQUE INDEX "notas_saida_itens_empresaId_codigoLegado_key" ON "notas_saida_itens"("empresaId", "codigoLegado");

-- CreateIndex
CREATE INDEX "titulos_receber_empresaId_clienteId_idx" ON "titulos_receber"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "titulos_receber_empresaId_vendedorId_vencimento_idx" ON "titulos_receber"("empresaId", "vendedorId", "vencimento");

-- CreateIndex
CREATE INDEX "titulos_receber_empresaId_vencimento_idx" ON "titulos_receber"("empresaId", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "titulos_receber_empresaId_codigoLegado_key" ON "titulos_receber"("empresaId", "codigoLegado");

-- CreateIndex
CREATE INDEX "produtos_empresaId_categoriaId_idx" ON "produtos"("empresaId", "categoriaId");

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_subCategoriaId_fkey" FOREIGN KEY ("subCategoriaId") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_armazemId_fkey" FOREIGN KEY ("armazemId") REFERENCES "armazens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoques" ADD CONSTRAINT "estoques_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoques" ADD CONSTRAINT "estoques_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoques" ADD CONSTRAINT "estoques_armazemId_fkey" FOREIGN KEY ("armazemId") REFERENCES "armazens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida" ADD CONSTRAINT "notas_saida_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida" ADD CONSTRAINT "notas_saida_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida" ADD CONSTRAINT "notas_saida_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida" ADD CONSTRAINT "notas_saida_condicaoPagamentoId_fkey" FOREIGN KEY ("condicaoPagamentoId") REFERENCES "condicoes_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida_itens" ADD CONSTRAINT "notas_saida_itens_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida_itens" ADD CONSTRAINT "notas_saida_itens_notaSaidaId_fkey" FOREIGN KEY ("notaSaidaId") REFERENCES "notas_saida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida_itens" ADD CONSTRAINT "notas_saida_itens_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida_itens" ADD CONSTRAINT "notas_saida_itens_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida_itens" ADD CONSTRAINT "notas_saida_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "estoques" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_estoques ON "estoques"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

ALTER TABLE "notas_saida" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_notas_saida ON "notas_saida"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

ALTER TABLE "notas_saida_itens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_notas_saida_itens ON "notas_saida_itens"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

ALTER TABLE "titulos_receber" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_titulos_receber ON "titulos_receber"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

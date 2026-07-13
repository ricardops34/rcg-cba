-- CreateTable
CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoErp" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT,
    "categoria" TEXT,
    "subCategoria" TEXT,
    "marca" TEXT,
    "codigoBarras" TEXT,
    "ncm" TEXT,
    "qtdEmbalagem" DOUBLE PRECISION,
    "peso" DOUBLE PRECISION,
    "ultimoPreco" DOUBLE PRECISION,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "titulos_receber" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "colaboradorId" TEXT,
    "numero" TEXT NOT NULL,
    "parcela" TEXT,
    "prefixo" TEXT,
    "tipo" TEXT,
    "emissao" TIMESTAMP(3) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saldo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dtBaixa" TIMESTAMP(3),
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

-- AlterTable
ALTER TABLE "notas_saida" ADD COLUMN "comodato" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "notas_saida_itens" ADD COLUMN "produtoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "produtos_empresaId_codigoErp_key" ON "produtos"("empresaId", "codigoErp");

-- CreateIndex
CREATE INDEX "produtos_empresaId_descricao_idx" ON "produtos"("empresaId", "descricao");

-- CreateIndex
CREATE INDEX "titulos_receber_empresaId_clienteId_idx" ON "titulos_receber"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "titulos_receber_empresaId_colaboradorId_vencimento_idx" ON "titulos_receber"("empresaId", "colaboradorId", "vencimento");

-- CreateIndex
CREATE INDEX "notas_saida_itens_produtoId_idx" ON "notas_saida_itens"("produtoId");

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida_itens" ADD CONSTRAINT "notas_saida_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "produtos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_produtos ON "produtos"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

ALTER TABLE "titulos_receber" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_titulos_receber ON "titulos_receber"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

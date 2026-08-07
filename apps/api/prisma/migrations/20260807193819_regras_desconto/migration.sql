-- Cadastro de Regras de Desconto (espelha a SZ0 do ERP): cabeçalho com os
-- tetos de desconto e a comissão cheia, e as faixas que escalonam quanto
-- dessa comissão sobra conforme o desconto concedido.

-- CreateTable
CREATE TABLE "regras_desconto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoErp" TEXT,
    "descricao" TEXT NOT NULL,
    "descontoMaximo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percMaximoPermitido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percComissao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "regras_desconto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regras_desconto_faixas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "regraDescontoId" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "percInicial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percFinal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percBaseComissao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "regras_desconto_faixas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "regras_desconto_empresaId_descricao_idx" ON "regras_desconto"("empresaId", "descricao");

-- CreateIndex
CREATE UNIQUE INDEX "regras_desconto_empresaId_codigoErp_key" ON "regras_desconto"("empresaId", "codigoErp");

-- CreateIndex
CREATE INDEX "regras_desconto_faixas_empresaId_regraDescontoId_idx" ON "regras_desconto_faixas"("empresaId", "regraDescontoId");

-- CreateIndex
CREATE UNIQUE INDEX "regras_desconto_faixas_regraDescontoId_sequencia_key" ON "regras_desconto_faixas"("regraDescontoId", "sequencia");

-- AddForeignKey
ALTER TABLE "regras_desconto" ADD CONSTRAINT "regras_desconto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_desconto_faixas" ADD CONSTRAINT "regras_desconto_faixas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_desconto_faixas" ADD CONSTRAINT "regras_desconto_faixas_regraDescontoId_fkey" FOREIGN KEY ("regraDescontoId") REFERENCES "regras_desconto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "regras_desconto" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_regras_desconto ON "regras_desconto"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

ALTER TABLE "regras_desconto_faixas" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_regras_desconto_faixas ON "regras_desconto_faixas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

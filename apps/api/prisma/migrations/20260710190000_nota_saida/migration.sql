-- CreateTable
CREATE TABLE "notas_saida" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "colaboradorId" TEXT,
    "numero" TEXT NOT NULL,
    "serie" TEXT,
    "especieFiscal" TEXT,
    "dtEmissao" TIMESTAMP(3) NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "vlrMercadoria" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrIcms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrIpi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrFrete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrItens" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chaveNfe" TEXT,
    "observacao" TEXT,
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
    "notaSaidaId" TEXT NOT NULL,
    "item" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "vlrUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notas_saida_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notas_saida_empresaId_colaboradorId_ano_mes_idx" ON "notas_saida"("empresaId", "colaboradorId", "ano", "mes");

-- CreateIndex
CREATE INDEX "notas_saida_empresaId_clienteId_idx" ON "notas_saida"("empresaId", "clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "notas_saida_empresaId_numero_serie_key" ON "notas_saida"("empresaId", "numero", "serie");

-- CreateIndex
CREATE INDEX "notas_saida_itens_notaSaidaId_idx" ON "notas_saida_itens"("notaSaidaId");

-- AddForeignKey
ALTER TABLE "notas_saida" ADD CONSTRAINT "notas_saida_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida" ADD CONSTRAINT "notas_saida_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida" ADD CONSTRAINT "notas_saida_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_saida_itens" ADD CONSTRAINT "notas_saida_itens_notaSaidaId_fkey" FOREIGN KEY ("notaSaidaId") REFERENCES "notas_saida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
-- notas_saida_itens não tem empresaId próprio (herda o isolamento via notaSaidaId -> notas_saida).
ALTER TABLE "notas_saida" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_notas_saida ON "notas_saida"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- CreateTable
CREATE TABLE "tabelas_preco" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoErp" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "dtInicio" TIMESTAMP(3),
    "dtFim" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "tabelas_preco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tabela_preco_itens" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tabelaPrecoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "codigoLegado" INTEGER,
    "preco" DOUBLE PRECISION NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "tabela_preco_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tabelas_preco_empresaId_descricao_idx" ON "tabelas_preco"("empresaId", "descricao");

-- CreateIndex
CREATE UNIQUE INDEX "tabelas_preco_empresaId_codigoErp_key" ON "tabelas_preco"("empresaId", "codigoErp");

-- CreateIndex
CREATE INDEX "tabela_preco_itens_tabelaPrecoId_produtoId_idx" ON "tabela_preco_itens"("tabelaPrecoId", "produtoId");

-- CreateIndex
CREATE INDEX "tabela_preco_itens_empresaId_produtoId_idx" ON "tabela_preco_itens"("empresaId", "produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "tabela_preco_itens_empresaId_codigoLegado_key" ON "tabela_preco_itens"("empresaId", "codigoLegado");

-- AddForeignKey
ALTER TABLE "tabelas_preco" ADD CONSTRAINT "tabelas_preco_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabela_preco_itens" ADD CONSTRAINT "tabela_preco_itens_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabela_preco_itens" ADD CONSTRAINT "tabela_preco_itens_tabelaPrecoId_fkey" FOREIGN KEY ("tabelaPrecoId") REFERENCES "tabelas_preco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabela_preco_itens" ADD CONSTRAINT "tabela_preco_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RowLevelSecurity
ALTER TABLE "tabelas_preco" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tabelas_preco ON "tabelas_preco"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- RowLevelSecurity
ALTER TABLE "tabela_preco_itens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tabela_preco_itens ON "tabela_preco_itens"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

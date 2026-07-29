-- CreateTable
CREATE TABLE "objetivos_vendedor_mes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "codigoLegado" INTEGER,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "numeroCliente" DOUBLE PRECISION,
    "novoCliente" DOUBLE PRECISION,
    "tipo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "objetivos_vendedor_mes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objetivos_vendedor_categoria" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "objetivoVendedorMesId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "codigoLegado" INTEGER,
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "objetivos_vendedor_categoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "objetivos_vendedor_mes_empresaId_ano_mes_idx" ON "objetivos_vendedor_mes"("empresaId", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "objetivos_vendedor_mes_empresaId_vendedorId_mes_ano_key" ON "objetivos_vendedor_mes"("empresaId", "vendedorId", "mes", "ano");

-- CreateIndex
CREATE UNIQUE INDEX "objetivos_vendedor_mes_empresaId_codigoLegado_key" ON "objetivos_vendedor_mes"("empresaId", "codigoLegado");

-- CreateIndex
CREATE UNIQUE INDEX "objetivos_vendedor_categoria_objetivoVendedorMesId_categori_key" ON "objetivos_vendedor_categoria"("objetivoVendedorMesId", "categoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "objetivos_vendedor_categoria_empresaId_codigoLegado_key" ON "objetivos_vendedor_categoria"("empresaId", "codigoLegado");

-- AddForeignKey
ALTER TABLE "objetivos_vendedor_mes" ADD CONSTRAINT "objetivos_vendedor_mes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objetivos_vendedor_mes" ADD CONSTRAINT "objetivos_vendedor_mes_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objetivos_vendedor_categoria" ADD CONSTRAINT "objetivos_vendedor_categoria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objetivos_vendedor_categoria" ADD CONSTRAINT "objetivos_vendedor_categoria_objetivoVendedorMesId_fkey" FOREIGN KEY ("objetivoVendedorMesId") REFERENCES "objetivos_vendedor_mes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objetivos_vendedor_categoria" ADD CONSTRAINT "objetivos_vendedor_categoria_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "objetivos_vendedor_mes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_objetivos_vendedor_mes ON "objetivos_vendedor_mes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

ALTER TABLE "objetivos_vendedor_categoria" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_objetivos_vendedor_categoria ON "objetivos_vendedor_categoria"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

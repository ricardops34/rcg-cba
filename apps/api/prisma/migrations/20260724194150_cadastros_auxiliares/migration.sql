-- CreateTable
CREATE TABLE "paises" (
    "id" TEXT NOT NULL,
    "codigoErp" TEXT,
    "nome" TEXT NOT NULL,
    "sigla" TEXT,
    "comexId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "paises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estados" (
    "id" TEXT NOT NULL,
    "codigoErp" TEXT,
    "sigla" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "codigoIbge" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "estados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipios" (
    "id" TEXT NOT NULL,
    "estadoId" TEXT,
    "codigoErp" TEXT,
    "descricao" TEXT NOT NULL,
    "codigoIbge" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "municipios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ceps" (
    "id" TEXT NOT NULL,
    "cep" TEXT NOT NULL,
    "estadoId" TEXT,
    "municipioId" TEXT,
    "bairro" TEXT,
    "endereco" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "origem" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "ceps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cnaes" (
    "id" TEXT NOT NULL,
    "codigoErp" TEXT,
    "secao" TEXT,
    "divisao" TEXT,
    "grupo" TEXT,
    "classe" TEXT,
    "subclasse" TEXT,
    "descricao" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "cnaes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "categoriaPaiId" TEXT,
    "codigoErp" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "usado" BOOLEAN,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condicoes_pagamento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoErp" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "forma" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "condicoes_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "armazens" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoErp" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "armazens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "paises_codigoErp_key" ON "paises"("codigoErp");

-- CreateIndex
CREATE UNIQUE INDEX "estados_sigla_key" ON "estados"("sigla");

-- CreateIndex
CREATE INDEX "municipios_descricao_idx" ON "municipios"("descricao");

-- CreateIndex
CREATE UNIQUE INDEX "municipios_codigoErp_key" ON "municipios"("codigoErp");

-- CreateIndex
CREATE UNIQUE INDEX "ceps_cep_key" ON "ceps"("cep");

-- CreateIndex
CREATE UNIQUE INDEX "cnaes_codigoErp_key" ON "cnaes"("codigoErp");

-- CreateIndex
CREATE INDEX "categorias_empresaId_descricao_idx" ON "categorias"("empresaId", "descricao");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_empresaId_codigoErp_key" ON "categorias"("empresaId", "codigoErp");

-- CreateIndex
CREATE UNIQUE INDEX "condicoes_pagamento_empresaId_codigoErp_key" ON "condicoes_pagamento"("empresaId", "codigoErp");

-- CreateIndex
CREATE UNIQUE INDEX "armazens_empresaId_codigoErp_key" ON "armazens"("empresaId", "codigoErp");

-- AddForeignKey
ALTER TABLE "municipios" ADD CONSTRAINT "municipios_estadoId_fkey" FOREIGN KEY ("estadoId") REFERENCES "estados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ceps" ADD CONSTRAINT "ceps_estadoId_fkey" FOREIGN KEY ("estadoId") REFERENCES "estados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ceps" ADD CONSTRAINT "ceps_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "municipios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_categoriaPaiId_fkey" FOREIGN KEY ("categoriaPaiId") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condicoes_pagamento" ADD CONSTRAINT "condicoes_pagamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armazens" ADD CONSTRAINT "armazens_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant) nas tabelas de negócio deste
-- grupo. As tabelas de referência global (paises, estados, municipios, ceps,
-- cnaes) não têm empresaId e ficam fora da RLS, como modulos/menus.
ALTER TABLE "categorias" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_categorias ON "categorias"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

ALTER TABLE "condicoes_pagamento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_condicoes_pagamento ON "condicoes_pagamento"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

ALTER TABLE "armazens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_armazens ON "armazens"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

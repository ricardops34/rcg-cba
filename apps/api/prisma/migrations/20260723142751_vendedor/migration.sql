-- CreateTable
CREATE TABLE "vendedores" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "codigoErp" TEXT,
    "nome" TEXT NOT NULL,
    "nomeReduzido" TEXT,
    "telefone" TEXT,
    "celular" TEXT,
    "email" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "vendedor" BOOLEAN NOT NULL DEFAULT true,
    "supervisorId" TEXT,
    "supervisor" BOOLEAN NOT NULL DEFAULT false,
    "gerenteId" TEXT,
    "gerente" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "desligado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "vendedores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendedores_empresaId_nome_idx" ON "vendedores"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "vendedores_empresaId_codigoErp_key" ON "vendedores"("empresaId", "codigoErp");

-- AddForeignKey
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_gerenteId_fkey" FOREIGN KEY ("gerenteId") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "vendedores" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_vendedores ON "vendedores"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

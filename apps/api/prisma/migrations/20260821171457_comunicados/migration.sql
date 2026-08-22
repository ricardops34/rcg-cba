-- CreateTable
CREATE TABLE "comunicados" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "inicioEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fimEm" TIMESTAMP(3),
    "fixado" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "comunicados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comunicado_perfis" (
    "empresaId" TEXT NOT NULL,
    "comunicadoId" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,

    CONSTRAINT "comunicado_perfis_pkey" PRIMARY KEY ("comunicadoId","perfilId")
);

-- CreateIndex
CREATE INDEX "comunicados_empresaId_ativo_inicioEm_idx" ON "comunicados"("empresaId", "ativo", "inicioEm");

-- CreateIndex
CREATE INDEX "comunicado_perfis_empresaId_perfilId_idx" ON "comunicado_perfis"("empresaId", "perfilId");

-- AddForeignKey
ALTER TABLE "comunicados" ADD CONSTRAINT "comunicados_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicado_perfis" ADD CONSTRAINT "comunicado_perfis_comunicadoId_fkey" FOREIGN KEY ("comunicadoId") REFERENCES "comunicados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicado_perfis" ADD CONSTRAINT "comunicado_perfis_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "perfis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicado_perfis" ADD CONSTRAINT "comunicado_perfis_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "comunicados" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_comunicados ON "comunicados"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- A junção também carrega empresaId e também recebe policy: sem ela, o destino
-- de um comunicado (quais perfis o veem) seria legível de qualquer tenant por
-- uma consulta direta, mesmo com o comunicado protegido.
ALTER TABLE "comunicado_perfis" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_comunicado_perfis ON "comunicado_perfis"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

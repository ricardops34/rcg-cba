-- Histórico do tour por usuário e empresa. A separação por empresa é
-- reforçada por RLS; toda consulta da API passa por PrismaService.withTenant.
CREATE TYPE "TourOrigem" AS ENUM ('automatico', 'manual');
CREATE TYPE "TourStatus" AS ENUM ('em_andamento', 'concluido', 'dispensado');

CREATE TABLE "tour_execucoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tourCodigo" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "origem" "TourOrigem" NOT NULL,
    "status" "TourStatus" NOT NULL DEFAULT 'em_andamento',
    "passoAtual" INTEGER NOT NULL DEFAULT 0,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_execucoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tour_execucoes_usuario_versao_idx"
ON "tour_execucoes"("empresaId", "usuarioId", "tourCodigo", "versao", "iniciadoEm");

ALTER TABLE "tour_execucoes"
ADD CONSTRAINT "tour_execucoes_empresaId_fkey" FOREIGN KEY ("empresaId")
REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tour_execucoes"
ADD CONSTRAINT "tour_execucoes_usuarioId_fkey" FOREIGN KEY ("usuarioId")
REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tour_execucoes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tour_execucoes ON "tour_execucoes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

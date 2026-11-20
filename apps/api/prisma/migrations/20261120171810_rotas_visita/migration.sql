-- Rotas de visita (Gerencial > Mapa e Rotas). Decisões do usuário em 2026-11-20
-- (docs/planos/2026-11-20-mapas-clientes-rotas.md): caminho pela Google Routes
-- API quando ligada (senão ordem por proximidade); cada parada vira atividade
-- `visita` na Agenda do vendedor, e visita feita = atividade concluída.
CREATE TABLE "rotas_visita" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "nome" TEXT NOT NULL,
    "origemLatitude" DOUBLE PRECISION NOT NULL,
    "origemLongitude" DOUBLE PRECISION NOT NULL,
    "retornar" BOOLEAN NOT NULL DEFAULT true,
    "calculadaPor" TEXT NOT NULL,
    "distanciaMetros" INTEGER,
    "duracaoSegundos" INTEGER,
    "polilinha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "rotas_visita_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rotas_visita_paradas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "rotaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "atividadeId" TEXT,

    CONSTRAINT "rotas_visita_paradas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rotas_visita_empresaId_vendedorId_data_idx" ON "rotas_visita"("empresaId", "vendedorId", "data");
CREATE INDEX "rotas_visita_paradas_empresaId_rotaId_idx" ON "rotas_visita_paradas"("empresaId", "rotaId");

ALTER TABLE "rotas_visita" ADD CONSTRAINT "rotas_visita_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rotas_visita" ADD CONSTRAINT "rotas_visita_vendedorId_fkey"
  FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rotas_visita_paradas" ADD CONSTRAINT "rotas_visita_paradas_rotaId_fkey"
  FOREIGN KEY ("rotaId") REFERENCES "rotas_visita"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rotas_visita_paradas" ADD CONSTRAINT "rotas_visita_paradas_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "rotas_visita" TO plataforma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "rotas_visita_paradas" TO plataforma_app;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "rotas_visita" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rotas_visita_paradas" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_rotas_visita ON "rotas_visita"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));
CREATE POLICY tenant_isolation_rotas_visita_paradas ON "rotas_visita_paradas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

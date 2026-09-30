CREATE TABLE "agente_resumos_exibidos" (
  "empresaId" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  CONSTRAINT "agente_resumos_exibidos_pkey" PRIMARY KEY ("empresaId", "usuarioId")
);
ALTER TABLE "agente_resumos_exibidos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_agente_resumos_exibidos ON "agente_resumos_exibidos"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

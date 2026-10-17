-- Roteiro semanal de atendimentos por WhatsApp (docs/planos/2026-10-16-agendamentos-whatsapp.md, §7).
-- Tabelas novas com empresaId: RLS na mesma migration.
CREATE TYPE "WhatsappRoteiroItemStatus" AS ENUM ('agendado', 'confirmado', 'iniciado', 'finalizado', 'cancelado', 'erro');

ALTER TABLE "atividades" ADD COLUMN "roteiroItemId" TEXT;
CREATE INDEX "atividades_empresaId_roteiroItemId_idx" ON "atividades"("empresaId", "roteiroItemId");

CREATE TABLE "whatsapp_roteiros" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "periodoInicio" DATE NOT NULL,
    "periodoFim" DATE NOT NULL,
    "intervaloMin" INTEGER NOT NULL,
    "criterios" JSONB NOT NULL,
    "textoNota" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_roteiros_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_roteiro_itens" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "roteiroId" TEXT NOT NULL,
    "atividadeId" TEXT,
    "clienteId" TEXT NOT NULL,
    "contatoId" TEXT,
    "conversaId" TEXT,
    "quando" TIMESTAMP(3) NOT NULL,
    "status" "WhatsappRoteiroItemStatus" NOT NULL DEFAULT 'agendado',
    "motivos" JSONB NOT NULL,
    "confirmadoEm" TIMESTAMP(3),
    "iniciadoEm" TIMESTAMP(3),
    "finalizadoEm" TIMESTAMP(3),
    "resultado" TEXT,
    "erro" TEXT,
    "motivoCancelamento" TEXT,
    "canceladoPor" TEXT,
    "canceladoEm" TIMESTAMP(3),
    "avisoAtrasoEm" TIMESTAMP(3),

    CONSTRAINT "whatsapp_roteiro_itens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "whatsapp_roteiros_empresaId_usuarioId_criadoEm_idx" ON "whatsapp_roteiros"("empresaId", "usuarioId", "criadoEm");
CREATE INDEX "whatsapp_roteiro_itens_status_quando_idx" ON "whatsapp_roteiro_itens"("status", "quando");
CREATE INDEX "whatsapp_roteiro_itens_empresaId_roteiroId_idx" ON "whatsapp_roteiro_itens"("empresaId", "roteiroId");
CREATE INDEX "whatsapp_roteiro_itens_empresaId_clienteId_idx" ON "whatsapp_roteiro_itens"("empresaId", "clienteId");

ALTER TABLE "whatsapp_roteiros" ADD CONSTRAINT "whatsapp_roteiros_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_roteiro_itens" ADD CONSTRAINT "whatsapp_roteiro_itens_roteiroId_fkey" FOREIGN KEY ("roteiroId") REFERENCES "whatsapp_roteiros"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), como as demais tabelas de negócio.
ALTER TABLE "whatsapp_roteiros" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_whatsapp_roteiros ON "whatsapp_roteiros"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "whatsapp_roteiro_itens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_whatsapp_roteiro_itens ON "whatsapp_roteiro_itens"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

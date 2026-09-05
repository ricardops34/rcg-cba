-- Recado interno pelo número institucional
-- (docs/planos/whatsapp-institucional-funcionarios.md, Fatia 4).
--
-- Só alcança a equipe: não há envio em massa para cliente nesta plataforma.
-- Uma linha por destinatário porque o resultado é por pessoa — quem não tem
-- telefone no cadastro não recebe, e quem escreveu precisa ver isso.

CREATE TABLE "whatsapp_recados_internos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "enviarEm" TIMESTAMP(3),
    "status" "WhatsappAgendamentoStatus" NOT NULL DEFAULT 'pendente',
    "criadoPor" TEXT NOT NULL,
    "criadoPorNome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_recados_internos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_recados_destinatarios" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "recadoId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "status" "WhatsappAgendamentoStatus" NOT NULL DEFAULT 'pendente',
    "erro" TEXT,
    "enviadoEm" TIMESTAMP(3),

    CONSTRAINT "whatsapp_recados_destinatarios_pkey" PRIMARY KEY ("id")
);

-- A varredura procura por (status, enviarEm) a cada minuto: sem este índice é
-- uma varredura na tabela inteira a cada passagem.
CREATE INDEX "whatsapp_recados_internos_status_enviarEm_idx" ON "whatsapp_recados_internos"("status", "enviarEm");
CREATE INDEX "whatsapp_recados_internos_empresaId_criadoEm_idx" ON "whatsapp_recados_internos"("empresaId", "criadoEm");
CREATE INDEX "whatsapp_recados_destinatarios_empresaId_recadoId_idx" ON "whatsapp_recados_destinatarios"("empresaId", "recadoId");

ALTER TABLE "whatsapp_recados_internos" ADD CONSTRAINT "whatsapp_recados_internos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_recados_destinatarios" ADD CONSTRAINT "whatsapp_recados_destinatarios_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_recados_destinatarios" ADD CONSTRAINT "whatsapp_recados_destinatarios_recadoId_fkey" FOREIGN KEY ("recadoId") REFERENCES "whatsapp_recados_internos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
-- A tabela-filha carrega `empresaId` e recebe policy própria pelo mesmo motivo de
-- `orcamento_itens`: sem ela, uma consulta direta à filha escaparia do corte.
ALTER TABLE "whatsapp_recados_internos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_recados_destinatarios" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_whatsapp_recados_internos ON "whatsapp_recados_internos"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY tenant_isolation_whatsapp_recados_destinatarios ON "whatsapp_recados_destinatarios"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

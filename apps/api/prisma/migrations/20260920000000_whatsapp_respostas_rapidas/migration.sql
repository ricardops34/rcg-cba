-- CreateTable
CREATE TABLE "whatsapp_respostas_rapidas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "atalho" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_respostas_rapidas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_respostas_rapidas_empresaId_atalho_key" ON "whatsapp_respostas_rapidas"("empresaId", "atalho");

-- CreateIndex
CREATE INDEX "whatsapp_respostas_rapidas_empresaId_idx" ON "whatsapp_respostas_rapidas"("empresaId");

-- AddForeignKey
ALTER TABLE "whatsapp_respostas_rapidas" ADD CONSTRAINT "whatsapp_respostas_rapidas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable RLS & Tenant Isolation Policy
ALTER TABLE "whatsapp_respostas_rapidas" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_whatsapp_respostas_rapidas ON "whatsapp_respostas_rapidas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

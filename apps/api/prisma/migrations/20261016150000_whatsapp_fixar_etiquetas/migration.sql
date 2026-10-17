-- Conversa fixada no topo (até 4 por conexão) e etiquetas pessoais de contato.
-- Tabelas novas com empresaId: RLS na mesma migration (ver README desta pasta).
ALTER TABLE "whatsapp_conversas" ADD COLUMN "fixadaEm" TIMESTAMP(3);
CREATE INDEX "whatsapp_conversas_sessaoId_fixadaEm_idx" ON "whatsapp_conversas"("sessaoId", "fixadaEm");

CREATE TABLE "whatsapp_etiquetas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT 'azul',
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_etiquetas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_contato_etiquetas" (
    "empresaId" TEXT NOT NULL,
    "contatoId" TEXT NOT NULL,
    "etiquetaId" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_contato_etiquetas_pkey" PRIMARY KEY ("contatoId","etiquetaId")
);

CREATE UNIQUE INDEX "whatsapp_etiquetas_empresaId_usuarioId_nome_key" ON "whatsapp_etiquetas"("empresaId", "usuarioId", "nome");
CREATE INDEX "whatsapp_etiquetas_empresaId_usuarioId_idx" ON "whatsapp_etiquetas"("empresaId", "usuarioId");
CREATE INDEX "whatsapp_contato_etiquetas_empresaId_etiquetaId_idx" ON "whatsapp_contato_etiquetas"("empresaId", "etiquetaId");

ALTER TABLE "whatsapp_etiquetas" ADD CONSTRAINT "whatsapp_etiquetas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_contato_etiquetas" ADD CONSTRAINT "whatsapp_contato_etiquetas_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "whatsapp_contatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_contato_etiquetas" ADD CONSTRAINT "whatsapp_contato_etiquetas_etiquetaId_fkey" FOREIGN KEY ("etiquetaId") REFERENCES "whatsapp_etiquetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), como as demais tabelas de negócio.
ALTER TABLE "whatsapp_etiquetas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_whatsapp_etiquetas ON "whatsapp_etiquetas"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

ALTER TABLE "whatsapp_contato_etiquetas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_whatsapp_contato_etiquetas ON "whatsapp_contato_etiquetas"
  USING (("empresaId" = current_setting('app.current_empresa_id'::text, true)));

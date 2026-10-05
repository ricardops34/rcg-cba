-- Corrige as migrations 20261002120000 e 20261002200000, que foram commitadas
-- vazias: o `migrate deploy` as marcou como aplicadas sem criar nada, e a API
-- caiu com P2022 em `whatsapp_mensagens.numeroSessao`. Idempotente, para não
-- falhar numa base onde alguém já tenha criado parte disto à mão.

-- Número do WhatsApp da sessão no momento do envio/recebimento da mensagem.
ALTER TABLE "whatsapp_mensagens" ADD COLUMN IF NOT EXISTS "numeroSessao" TEXT;

-- Períodos em que um número esteve conectado a uma sessão.
CREATE TABLE IF NOT EXISTS "whatsapp_sessao_periodos" (
  "id"             TEXT NOT NULL,
  "empresaId"      TEXT NOT NULL,
  "sessaoId"       TEXT NOT NULL,
  "vendedorId"     TEXT,
  "numero"         TEXT NOT NULL,
  "conectadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "desconectadoEm" TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_sessao_periodos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "whatsapp_sessao_periodos_empresaId_sessaoId_idx" ON "whatsapp_sessao_periodos"("empresaId", "sessaoId");
CREATE INDEX IF NOT EXISTS "whatsapp_sessao_periodos_empresaId_vendedorId_idx" ON "whatsapp_sessao_periodos"("empresaId", "vendedorId");
CREATE INDEX IF NOT EXISTS "whatsapp_sessao_periodos_empresaId_numero_idx" ON "whatsapp_sessao_periodos"("empresaId", "numero");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_sessao_periodos_empresaId_fkey') THEN
    ALTER TABLE "whatsapp_sessao_periodos" ADD CONSTRAINT "whatsapp_sessao_periodos_empresaId_fkey"
      FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_sessao_periodos_sessaoId_fkey') THEN
    ALTER TABLE "whatsapp_sessao_periodos" ADD CONSTRAINT "whatsapp_sessao_periodos_sessaoId_fkey"
      FOREIGN KEY ("sessaoId") REFERENCES "whatsapp_sessoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_sessao_periodos_vendedorId_fkey') THEN
    ALTER TABLE "whatsapp_sessao_periodos" ADD CONSTRAINT "whatsapp_sessao_periodos_vendedorId_fkey"
      FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "whatsapp_sessao_periodos" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_whatsapp_sessao_periodos ON "whatsapp_sessao_periodos";
CREATE POLICY tenant_isolation_whatsapp_sessao_periodos ON "whatsapp_sessao_periodos"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "whatsapp_sessao_periodos" TO plataforma_app;

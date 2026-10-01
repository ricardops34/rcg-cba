-- Envio de SMS pela iAgente (docs/planos/2026-10-01-sms-iagente.md).
CREATE TYPE "SmsMotivo" AS ENUM (
  'boleto', 'cobranca', 'mensagem_livre', 'senha_provisoria',
  'aviso_antes_vencimento', 'aviso_depois_vencimento'
);

CREATE TABLE "sms_envios" (
  "id"              TEXT NOT NULL,
  "empresaId"       TEXT NOT NULL,
  "motivo"          "SmsMotivo" NOT NULL,
  "celular"         TEXT NOT NULL,
  "mensagem"        TEXT NOT NULL,
  "clienteId"       TEXT,
  "vendedorId"      TEXT,
  "tituloReceberId" TEXT,
  "provedorId"      TEXT,
  "status"          TEXT NOT NULL,
  "statusEm"        TIMESTAMP(3),
  "erro"            TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"       TEXT,
  CONSTRAINT "sms_envios_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sms_envios_empresaId_createdAt_idx" ON "sms_envios"("empresaId", "createdAt");
CREATE INDEX "sms_envios_empresaId_tituloReceberId_motivo_idx" ON "sms_envios"("empresaId", "tituloReceberId", "motivo");
CREATE INDEX "sms_envios_empresaId_clienteId_idx" ON "sms_envios"("empresaId", "clienteId");

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "sms_envios" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_sms_envios ON "sms_envios"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "sms_envios" TO plataforma_app;

-- Respostas do cliente, recebidas pelo webhook e vinculadas ao envio pelo
-- client_ref (= id do envio).
CREATE TABLE "sms_respostas" (
  "id"         TEXT NOT NULL,
  "empresaId"  TEXT NOT NULL,
  "smsEnvioId" TEXT,
  "clienteId"  TEXT,
  "celular"    TEXT NOT NULL,
  "mensagem"   TEXT NOT NULL,
  "recebidaEm" TIMESTAMP(3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sms_respostas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sms_respostas_smsEnvioId_fkey" FOREIGN KEY ("smsEnvioId")
    REFERENCES "sms_envios"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "sms_respostas_empresaId_smsEnvioId_idx" ON "sms_respostas"("empresaId", "smsEnvioId");
CREATE INDEX "sms_respostas_empresaId_clienteId_idx" ON "sms_respostas"("empresaId", "clienteId");

ALTER TABLE "sms_respostas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_sms_respostas ON "sms_respostas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "sms_respostas" TO plataforma_app;

-- Parâmetros: token da iAgente e o aviso automático (desligado por padrão —
-- manda SMS a clientes sem ninguém clicar).
INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), e."id", p."parametro", p."tipo"::"TipoParametro",
       p."tamanho", p."conteudo", p."descricao", true, now(), now()
FROM "empresas" e
CROSS JOIN (
  VALUES
    ('SMS_TOKEN', 'senha', 200, NULL, 'Token da API de SMS da iAgente (sk_live_...); vazio desliga o envio de SMS'),
    ('SMS_AVISO_VENCIMENTO_ATIVO', 'booleano', NULL, 'false', 'Envia SMS automático ao cliente antes e depois do vencimento do título (das 8h às 18h)'),
    ('SMS_AVISO_DIAS_ANTES', 'numero', 2, '2', 'Dias antes do vencimento para o aviso por SMS; 0 = não avisa'),
    ('SMS_AVISO_DIAS_DEPOIS', 'numero', 2, '3', 'Dias depois do vencimento para o aviso de atraso por SMS; 0 = não avisa')
) AS p("parametro", "tipo", "tamanho", "conteudo", "descricao")
WHERE e."deletedAt" IS NULL
ON CONFLICT ("empresaId", "parametro") DO NOTHING;

-- Baixas do título a receber: espelho read-only da SE5 do Protheus.
-- Uma linha por movimento de baixa, porque um título aceita baixa parcial —
-- somar tudo no título perderia a data e os encargos de cada pagamento.
-- A plataforma nunca cria nem estorna baixa: o ERP manda pelo import.

-- CreateTable
CREATE TABLE "titulo_receber_baixas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tituloReceberId" TEXT NOT NULL,
    "chave" TEXT,
    "data" TIMESTAMP(3),
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "juros" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "multa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "desconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "abatimento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impostosRetidos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "motivo" TEXT,
    "historico" TEXT,
    "banco" TEXT,
    "agencia" TEXT,
    "conta" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "titulo_receber_baixas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "titulo_receber_baixas_empresaId_tituloReceberId_idx" ON "titulo_receber_baixas"("empresaId", "tituloReceberId");

-- CreateIndex
CREATE INDEX "titulo_receber_baixas_empresaId_data_idx" ON "titulo_receber_baixas"("empresaId", "data");

-- A chave é única dentro do título, não da empresa: é assim que o upsert do
-- import casa baixa a baixa em vez de apagar e recriar o conjunto a cada coleta.
-- CreateIndex
CREATE UNIQUE INDEX "titulo_receber_baixas_tituloReceberId_chave_key" ON "titulo_receber_baixas"("tituloReceberId", "chave");

-- AddForeignKey
ALTER TABLE "titulo_receber_baixas" ADD CONSTRAINT "titulo_receber_baixas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulo_receber_baixas" ADD CONSTRAINT "titulo_receber_baixas_tituloReceberId_fkey" FOREIGN KEY ("tituloReceberId") REFERENCES "titulos_receber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "titulo_receber_baixas" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_titulo_receber_baixas ON "titulo_receber_baixas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- O `GRANT ... ON ALL TABLES` da baseline só alcança as tabelas que existiam
-- quando ele rodou: tabela nova precisa do seu próprio GRANT, senão a API
-- (role `plataforma_app`) leva "permission denied" na primeira consulta.
GRANT SELECT, INSERT, UPDATE, DELETE ON "titulo_receber_baixas" TO plataforma_app;

-- Leads captados pela IA no número institucional
-- (docs/planos/whatsapp-institucional-funcionarios.md).
--
-- Não é `oportunidades`: aquela exige `clienteId` e `vendedorId` — é o funil de
-- quem já é cliente e já tem dono. Um lead é anterior aos dois, e forçá-lo
-- naquele modelo obrigaria a inventar um cliente para cada curioso que manda
-- mensagem.

-- `ALTER TYPE ... ADD VALUE` não roda dentro de bloco de transação em algumas
-- versões do Postgres; fica isolado no começo, antes de qualquer DDL que
-- dependa dele. Nada nesta migration usa o valor novo — quem o usa é a
-- aplicação, depois.
ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'lead_novo';

CREATE TYPE "LeadSituacao" AS ENUM ('novo', 'em_atendimento', 'convertido', 'descartado');
CREATE TYPE "LeadTemperatura" AS ENUM ('quente', 'morno', 'frio');

CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT,
    "empresaInformada" TEXT,
    "documento" TEXT,
    "telefone" TEXT NOT NULL,
    "interesse" TEXT NOT NULL,
    "temperatura" "LeadTemperatura" NOT NULL DEFAULT 'morno',
    "motivoClassificacao" TEXT,
    "situacao" "LeadSituacao" NOT NULL DEFAULT 'novo',
    "vendedorId" TEXT,
    "assumidoPor" TEXT,
    "assumidoEm" TIMESTAMP(3),
    "conversaId" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leads_empresaId_situacao_createdAt_idx" ON "leads"("empresaId", "situacao", "createdAt");

-- Um lead por conversa: a IA reescreve o mesmo registro conforme descobre mais,
-- em vez de criar um por mensagem. Sem isto, uma conversa de cinco trocas
-- deixaria cinco leads iguais para alguém limpar.
CREATE UNIQUE INDEX "leads_empresaId_conversaId_key" ON "leads"("empresaId", "conversaId");

ALTER TABLE "leads" ADD CONSTRAINT "leads_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_leads ON "leads"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

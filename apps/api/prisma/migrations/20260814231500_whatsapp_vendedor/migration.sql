-- WhatsApp do vendedor — Fatia 1 (conectar e conversar).
-- Ver docs/planos/whatsapp-vendedor.md

-- CreateEnum
CREATE TYPE "WhatsappTransporte" AS ENUM ('zapo', 'cloud_api');

-- CreateEnum
CREATE TYPE "WhatsappSessaoStatus" AS ENUM ('desconectada', 'pareando', 'conectada', 'banida');

-- CreateEnum
CREATE TYPE "WhatsappDirecao" AS ENUM ('entrada', 'saida');

-- CreateEnum
CREATE TYPE "WhatsappTipoMensagem" AS ENUM ('texto', 'imagem', 'documento', 'audio', 'video', 'localizacao', 'contato', 'outro');

-- CreateEnum
CREATE TYPE "WhatsappStatusEntrega" AS ENUM ('pendente', 'enviada', 'entregue', 'lida', 'erro');

-- CreateTable
CREATE TABLE "whatsapp_sessoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "numero" TEXT,
    "jid" TEXT,
    "status" "WhatsappSessaoStatus" NOT NULL DEFAULT 'desconectada',
    "transporte" "WhatsappTransporte" NOT NULL DEFAULT 'zapo',
    "credencialCifrada" TEXT,
    "ultimaConexao" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "aceiteEm" TIMESTAMP(3),
    "aceiteVersao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "whatsapp_sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_contatos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "nomeExibicao" TEXT,
    "telefoneNormalizado" TEXT,
    "clienteId" TEXT,
    "vinculadoPor" TEXT,
    "vinculadoEm" TIMESTAMP(3),
    "ignorado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_contatos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "contatoId" TEXT NOT NULL,
    "clienteId" TEXT,
    "ultimaMensagemEm" TIMESTAMP(3),
    "naoLidas" INTEGER NOT NULL DEFAULT 0,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_mensagens" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "externoId" TEXT NOT NULL,
    "direcao" "WhatsappDirecao" NOT NULL,
    "tipo" "WhatsappTipoMensagem" NOT NULL DEFAULT 'texto',
    "conteudo" TEXT,
    "arquivoUrl" TEXT,
    "arquivoNome" TEXT,
    "arquivoMime" TEXT,
    "enviadaPor" TEXT,
    "statusEntrega" "WhatsappStatusEntrega" NOT NULL DEFAULT 'pendente',
    "respondeuA" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_acoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "orcamentoId" TEXT,
    "atividadeId" TEXT,
    "tituloReceberId" TEXT,
    "detalhe" JSONB,
    "executadaPor" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_acoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_sessoes_empresaId_vendedorId_key" ON "whatsapp_sessoes"("empresaId", "vendedorId");

-- CreateIndex
CREATE INDEX "whatsapp_sessoes_empresaId_status_idx" ON "whatsapp_sessoes"("empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_contatos_empresaId_jid_key" ON "whatsapp_contatos"("empresaId", "jid");

-- CreateIndex
CREATE INDEX "whatsapp_contatos_empresaId_telefoneNormalizado_idx" ON "whatsapp_contatos"("empresaId", "telefoneNormalizado");

-- CreateIndex
CREATE INDEX "whatsapp_contatos_empresaId_clienteId_idx" ON "whatsapp_contatos"("empresaId", "clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversas_empresaId_sessaoId_contatoId_key" ON "whatsapp_conversas"("empresaId", "sessaoId", "contatoId");

-- CreateIndex
CREATE INDEX "whatsapp_conversas_empresaId_clienteId_idx" ON "whatsapp_conversas"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "whatsapp_conversas_empresaId_sessaoId_ultimaMensagemEm_idx" ON "whatsapp_conversas"("empresaId", "sessaoId", "ultimaMensagemEm");

-- Idempotência do recebimento: na reconexão o provedor reenvia o que já foi
-- entregue, e o mesmo id do WhatsApp não pode virar duas linhas. A unicidade é
-- por conversa porque o id só é único dentro do par remetente/destinatário.
-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_mensagens_empresaId_conversaId_externoId_key" ON "whatsapp_mensagens"("empresaId", "conversaId", "externoId");

-- CreateIndex
CREATE INDEX "whatsapp_mensagens_empresaId_conversaId_criadaEm_idx" ON "whatsapp_mensagens"("empresaId", "conversaId", "criadaEm");

-- CreateIndex
CREATE INDEX "whatsapp_acoes_empresaId_conversaId_criadaEm_idx" ON "whatsapp_acoes"("empresaId", "conversaId", "criadaEm");

-- AddForeignKey
ALTER TABLE "whatsapp_sessoes" ADD CONSTRAINT "whatsapp_sessoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_sessoes" ADD CONSTRAINT "whatsapp_sessoes_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_contatos" ADD CONSTRAINT "whatsapp_contatos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_contatos" ADD CONSTRAINT "whatsapp_contatos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversas" ADD CONSTRAINT "whatsapp_conversas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversas" ADD CONSTRAINT "whatsapp_conversas_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "whatsapp_sessoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversas" ADD CONSTRAINT "whatsapp_conversas_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "whatsapp_contatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversas" ADD CONSTRAINT "whatsapp_conversas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_mensagens" ADD CONSTRAINT "whatsapp_mensagens_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_mensagens" ADD CONSTRAINT "whatsapp_mensagens_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "whatsapp_conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_acoes" ADD CONSTRAINT "whatsapp_acoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_acoes" ADD CONSTRAINT "whatsapp_acoes_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "whatsapp_conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "whatsapp_sessoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_contatos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_conversas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_mensagens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_acoes" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_whatsapp_sessoes ON "whatsapp_sessoes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY tenant_isolation_whatsapp_contatos ON "whatsapp_contatos"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY tenant_isolation_whatsapp_conversas ON "whatsapp_conversas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY tenant_isolation_whatsapp_mensagens ON "whatsapp_mensagens"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY tenant_isolation_whatsapp_acoes ON "whatsapp_acoes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

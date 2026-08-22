-- 2ª via de DANFE e boleto (ver docs/planos/segunda-via-danfe-boleto.md).
--
-- Três coisas: o cadastro do convênio de cobrança, os campos de boleto no
-- título e os campos do XML autorizado na nota. Todos os campos novos das
-- tabelas existentes são NULLABLE de propósito — a base já tem centenas de
-- milhares de títulos e notas importados do legado, e nenhum deles tem esses
-- dados até o ERP passar a empurrá-los.

-- CreateTable
CREATE TABLE "contas_bancarias" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "agencia" TEXT NOT NULL,
    "agenciaDv" TEXT,
    "conta" TEXT NOT NULL,
    "contaDv" TEXT,
    "carteira" TEXT NOT NULL,
    "beneficiarioNome" TEXT,
    "beneficiarioDocumento" TEXT,
    "beneficiarioEndereco" TEXT,
    "localPagamento" TEXT NOT NULL DEFAULT 'Pagável em qualquer banco até o vencimento',
    "aceite" TEXT NOT NULL DEFAULT 'N',
    "especieDocumento" TEXT NOT NULL DEFAULT 'DM',
    "instrucoes" TEXT,
    "demonstrativo" TEXT,
    "jurosMesPerc" DOUBLE PRECISION,
    "multaPerc" DOUBLE PRECISION,
    "diasProtesto" INTEGER,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "contas_bancarias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contas_bancarias_empresaId_ativo_idx" ON "contas_bancarias"("empresaId", "ativo");

-- AddForeignKey
ALTER TABLE "contas_bancarias" ADD CONSTRAINT "contas_bancarias_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: dados do boleto no título
ALTER TABLE "titulos_receber" ADD COLUMN "contaBancariaId" TEXT;
ALTER TABLE "titulos_receber" ADD COLUMN "nossoNumero" TEXT;
ALTER TABLE "titulos_receber" ADD COLUMN "carteira" TEXT;
ALTER TABLE "titulos_receber" ADD COLUMN "codigoBarras" TEXT;
ALTER TABLE "titulos_receber" ADD COLUMN "linhaDigitavel" TEXT;

-- AddForeignKey
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: XML autorizado da NF-e
ALTER TABLE "notas_saida" ADD COLUMN "xmlArquivo" TEXT;
ALTER TABLE "notas_saida" ADD COLUMN "xmlRecebidoEm" TIMESTAMP(3);
ALTER TABLE "notas_saida" ADD COLUMN "protocoloNfe" TEXT;
ALTER TABLE "notas_saida" ADD COLUMN "situacaoNfe" TEXT;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "contas_bancarias" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_contas_bancarias ON "contas_bancarias"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

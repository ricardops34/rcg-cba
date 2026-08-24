-- O XML autorizado da NF-e sai do disco e passa a viver em tabela própria
-- (ver docs/planos/segunda-via-danfe-boleto.md).
--
-- Por que tabela acessória e não coluna em `notas_saida`: o Prisma seleciona
-- todas as colunas quando não há `select` explícito, e as duas consultas de
-- nota do sistema não têm — a listagem paginada e a Posição de Cliente, que
-- carrega o histórico inteiro do cliente sem paginar. Uma coluna de XML ali
-- faria toda abertura de tela puxar megabytes que ninguém pediu.
--
-- `conteudo` é TEXT de propósito: o TOAST do Postgres tira o valor de dentro
-- da linha e comprime sozinho (~5 a 8x em XML), sem compressão em código.
--
-- `xmlArquivo` é removida sem migração de dados: a coluna foi criada dias
-- atrás e nenhum XML chegou a ser gravado (o ERP ainda não envia). Se em
-- alguma base já houver arquivos em `uploads/nfe`, eles precisam ser
-- reenviados pelo ERP — não há o que converter aqui.

-- AlterTable
ALTER TABLE "notas_saida" DROP COLUMN "xmlArquivo";

-- CreateTable
CREATE TABLE "nota_saida_xml" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "notaSaidaId" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recebidoPor" TEXT,

    CONSTRAINT "nota_saida_xml_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nota_saida_xml_notaSaidaId_key" ON "nota_saida_xml"("notaSaidaId");

-- CreateIndex
CREATE INDEX "nota_saida_xml_empresaId_recebidoEm_idx" ON "nota_saida_xml"("empresaId", "recebidoEm");

-- AddForeignKey
ALTER TABLE "nota_saida_xml" ADD CONSTRAINT "nota_saida_xml_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_saida_xml" ADD CONSTRAINT "nota_saida_xml_notaSaidaId_fkey" FOREIGN KEY ("notaSaidaId") REFERENCES "notas_saida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "nota_saida_xml" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_nota_saida_xml ON "nota_saida_xml"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

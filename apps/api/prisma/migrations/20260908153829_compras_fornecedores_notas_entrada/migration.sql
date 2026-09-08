-- Lado da compra: o cadastro de fornecedores e as notas de entrada com seus
-- itens, espelhos do ERP (SA2 / SF1 / SD1), irmãos de `clientes` e
-- `notas_saida`. Read-only na plataforma — entram e saem só pela API de
-- integração.
--
-- Sem tabela de XML, ao contrário da saída: o documento de entrada foi emitido
-- pelo fornecedor e ninguém aqui reimprime a segunda via dele.
--
-- Os itens repetem `empresaId`/`fornecedorId`/`dtEmissao`/`ano`/`mes` do
-- cabeçalho de propósito, como em `notas_saida_itens`: a apuração de compra
-- por produto varre a tabela de itens, e o join com o cabeçalho custa caro à
-- toa na maior tabela do módulo.

-- CreateTable
CREATE TABLE "fornecedores" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoErp" TEXT,
    "tipoPessoa" "TipoPessoa" NOT NULL DEFAULT 'juridica',
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpjCpf" TEXT,
    "inscricaoEstadual" TEXT,
    "inscricaoMunicipal" TEXT,
    "contato" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "celular" TEXT,
    "endereco" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "municipio" TEXT,
    "uf" TEXT,
    "cep" TEXT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_entrada" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigoErp" TEXT,
    "fornecedorId" TEXT,
    "condicaoPagamentoId" TEXT,
    "numero" TEXT NOT NULL,
    "serie" TEXT,
    "especieFiscal" TEXT,
    "tipo" TEXT,
    "dtEmissao" TIMESTAMP(3),
    "dtEntrada" TIMESTAMP(3),
    "ano" INTEGER,
    "mes" INTEGER,
    "vlrBruto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrMercadoria" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrItens" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrIcms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrIcmsSt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrIpi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrFrete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chaveNfe" TEXT,
    "dtNfe" TIMESTAMP(3),
    "mensagem" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "notas_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_entrada_itens" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "notaEntradaId" TEXT NOT NULL,
    "codigoErp" TEXT,
    "fornecedorId" TEXT,
    "produtoId" TEXT,
    "armazemId" TEXT,
    "item" INTEGER,
    "dtEmissao" TIMESTAMP(3),
    "ano" INTEGER,
    "mes" INTEGER,
    "cfop" TEXT,
    "ncm" TEXT,
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrUnitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrDesconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrIcms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrIcmsSt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vlrIpi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "peso" DOUBLE PRECISION,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,

    CONSTRAINT "notas_entrada_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fornecedores_empresaId_razaoSocial_idx" ON "fornecedores"("empresaId", "razaoSocial");

-- CreateIndex
CREATE INDEX "fornecedores_empresaId_cnpjCpf_idx" ON "fornecedores"("empresaId", "cnpjCpf");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_empresaId_codigoErp_key" ON "fornecedores"("empresaId", "codigoErp");

-- CreateIndex
CREATE INDEX "notas_entrada_empresaId_numero_idx" ON "notas_entrada"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "notas_entrada_empresaId_fornecedorId_idx" ON "notas_entrada"("empresaId", "fornecedorId");

-- CreateIndex
CREATE INDEX "notas_entrada_empresaId_dtEmissao_idx" ON "notas_entrada"("empresaId", "dtEmissao");

-- CreateIndex
CREATE INDEX "notas_entrada_empresaId_ano_mes_idx" ON "notas_entrada"("empresaId", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "notas_entrada_empresaId_codigoErp_key" ON "notas_entrada"("empresaId", "codigoErp");

-- CreateIndex
CREATE INDEX "notas_entrada_itens_notaEntradaId_idx" ON "notas_entrada_itens"("notaEntradaId");

-- CreateIndex
CREATE INDEX "notas_entrada_itens_empresaId_produtoId_idx" ON "notas_entrada_itens"("empresaId", "produtoId");

-- CreateIndex
CREATE INDEX "notas_entrada_itens_empresaId_fornecedorId_dtEmissao_idx" ON "notas_entrada_itens"("empresaId", "fornecedorId", "dtEmissao");

-- CreateIndex
CREATE UNIQUE INDEX "notas_entrada_itens_empresaId_codigoErp_key" ON "notas_entrada_itens"("empresaId", "codigoErp");

-- AddForeignKey
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_entrada" ADD CONSTRAINT "notas_entrada_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_entrada" ADD CONSTRAINT "notas_entrada_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_entrada" ADD CONSTRAINT "notas_entrada_condicaoPagamentoId_fkey" FOREIGN KEY ("condicaoPagamentoId") REFERENCES "condicoes_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_entrada_itens" ADD CONSTRAINT "notas_entrada_itens_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_entrada_itens" ADD CONSTRAINT "notas_entrada_itens_notaEntradaId_fkey" FOREIGN KEY ("notaEntradaId") REFERENCES "notas_entrada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_entrada_itens" ADD CONSTRAINT "notas_entrada_itens_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_entrada_itens" ADD CONSTRAINT "notas_entrada_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_entrada_itens" ADD CONSTRAINT "notas_entrada_itens_armazemId_fkey" FOREIGN KEY ("armazemId") REFERENCES "armazens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "fornecedores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notas_entrada" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notas_entrada_itens" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_fornecedores ON "fornecedores"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY tenant_isolation_notas_entrada ON "notas_entrada"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY tenant_isolation_notas_entrada_itens ON "notas_entrada_itens"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- O `GRANT ... ON ALL TABLES` da baseline só alcança as tabelas que existiam
-- quando ele rodou: tabela nova precisa do seu próprio GRANT, senão a API
-- (role `plataforma_app`) leva "permission denied" na primeira consulta.
GRANT SELECT, INSERT, UPDATE, DELETE ON "fornecedores" TO plataforma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "notas_entrada" TO plataforma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "notas_entrada_itens" TO plataforma_app;

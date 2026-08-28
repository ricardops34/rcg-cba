-- A tabela produtos já possui RLS e a policy de isolamento por empresa.
ALTER TABLE "produtos"
  ADD COLUMN "exibirFotoOrcamento" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "codigoFornecedor" TEXT;

CREATE INDEX "produtos_empresaId_codigoFornecedor_idx"
  ON "produtos"("empresaId", "codigoFornecedor");

CREATE TABLE "produto_fotos" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "produtoId" TEXT,
  "url" TEXT NOT NULL,
  "nomeArquivo" TEXT NOT NULL,
  "principal" BOOLEAN NOT NULL DEFAULT false,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT,
  CONSTRAINT "produto_fotos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "produto_fotos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "produto_fotos_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "produto_fotos_empresaId_produtoId_ordem_idx"
  ON "produto_fotos"("empresaId", "produtoId", "ordem");

CREATE UNIQUE INDEX "produto_fotos_principal_unica_idx"
  ON "produto_fotos"("produtoId") WHERE "principal" = true;

ALTER TABLE "produto_fotos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_produto_fotos ON "produto_fotos"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

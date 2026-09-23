-- Fabricante e dados técnicos do produto.
--
-- Estes quatro campos já estavam no `schema.prisma` e já eram usados pelo
-- código (`integracao-produtos.service.ts` grava `fabricanteId`,
-- `codigoFabricante`, `descricaoFabricante` e `dadosTecnicos`, e o INCLUDE
-- seleciona a relação), mas **nenhuma migration os criava**. Sem as colunas, o
-- Prisma monta o INSERT com campos inexistentes e a integração responde
-- HTTP 500 em `POST /api/v1/integracao/produtos` — foi o que apareceu em
-- produção em 22/09/2026.
--
-- Fabricante é um `Fornecedor`: quem fabrica é cadastrado na mesma tabela de
-- quem fornece, e a coluna é opcional porque o ERP nem sempre manda.

ALTER TABLE "produtos"
  ADD COLUMN IF NOT EXISTS "fabricanteId" TEXT,
  ADD COLUMN IF NOT EXISTS "codigoFabricante" TEXT,
  ADD COLUMN IF NOT EXISTS "descricaoFabricante" TEXT,
  ADD COLUMN IF NOT EXISTS "dadosTecnicos" TEXT;

CREATE INDEX IF NOT EXISTS "produtos_empresaId_fabricanteId_idx"
  ON "produtos"("empresaId", "fabricanteId");

-- ON DELETE RESTRICT / ON UPDATE CASCADE: o mesmo padrão das outras relações
-- opcionais de produto geradas pelo Prisma.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'produtos_fabricanteId_fkey'
  ) THEN
    ALTER TABLE "produtos"
      ADD CONSTRAINT "produtos_fabricanteId_fkey"
      FOREIGN KEY ("fabricanteId") REFERENCES "fornecedores"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

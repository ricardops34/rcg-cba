-- Numeração própria do orçamento (o "Nº" que sai na proposta em PDF):
-- sequencial por empresa, existente desde o rascunho. O codigoLegado continua
-- sendo só a chave de integração com o ERP, que nem sempre existe.

-- Contador por empresa. Fica no config de orçamento (que já é 1:1 com empresa)
-- e é incrementado por INSERT ... ON CONFLICT DO UPDATE — atômico, sem lock
-- explícito e sem risco de dois vendedores pegarem o mesmo número.
ALTER TABLE "orcamento_config" ADD COLUMN "ultimoNumero" INTEGER NOT NULL DEFAULT 0;

-- Entra nullable pra permitir o backfill dos orçamentos já gravados.
ALTER TABLE "orcamentos" ADD COLUMN "numero" INTEGER;

-- Backfill: numera 1..N por empresa, na ordem de criação.
UPDATE "orcamentos" o
SET "numero" = s.rn
FROM (
  SELECT id, row_number() OVER (PARTITION BY "empresaId" ORDER BY "createdAt", id) AS rn
  FROM "orcamentos"
) s
WHERE o.id = s.id;

-- O contador parte do maior número atribuído no backfill, criando o config
-- para as empresas que ainda não tinham um.
INSERT INTO "orcamento_config" ("id", "empresaId", "ultimoNumero", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "empresaId", MAX("numero"), now(), now()
FROM "orcamentos"
GROUP BY "empresaId"
ON CONFLICT ("empresaId") DO UPDATE SET "ultimoNumero" = EXCLUDED."ultimoNumero";

ALTER TABLE "orcamentos" ALTER COLUMN "numero" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_empresaId_numero_key" ON "orcamentos"("empresaId", "numero");

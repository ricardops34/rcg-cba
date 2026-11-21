-- Tabelas de referência compartilhadas com a Receita
-- (docs/planos/2026-11-21-tabelas-referencia-compartilhadas.md, 2026-11-21).
-- Referências globais, sem empresaId e sem RLS, como paises/estados/municipios/
-- ceps/cnaes (ver README).

-- Município: código municipal da Receita (TOM/SIAFI).
ALTER TABLE "municipios" ADD COLUMN "codigoReceita" TEXT;
CREATE INDEX "municipios_codigoReceita_idx" ON "municipios"("codigoReceita");

-- Natureza jurídica da Receita.
CREATE TABLE "naturezas_juridicas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "naturezas_juridicas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "naturezas_juridicas_codigo_key" ON "naturezas_juridicas"("codigo");
GRANT SELECT, INSERT, UPDATE, DELETE ON "naturezas_juridicas" TO plataforma_app;

-- Lead da Receita aponta para município e natureza; o CNAE do lead, para cnaes.
ALTER TABLE "leads" ADD COLUMN "municipioId" TEXT;
ALTER TABLE "leads" ADD COLUMN "naturezaJuridicaId" TEXT;
CREATE INDEX "leads_empresaId_municipioId_idx" ON "leads"("empresaId", "municipioId");
ALTER TABLE "leads" ADD CONSTRAINT "leads_municipioId_fkey" FOREIGN KEY ("municipioId") REFERENCES "municipios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_naturezaJuridicaId_fkey" FOREIGN KEY ("naturezaJuridicaId") REFERENCES "naturezas_juridicas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lead_cnaes" ADD COLUMN "cnaeId" TEXT;
ALTER TABLE "lead_cnaes" ADD CONSTRAINT "lead_cnaes_cnaeId_fkey" FOREIGN KEY ("cnaeId") REFERENCES "cnaes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Leads da Receita que já existem: município pelo IBGE guardado no retorno
-- bruto, natureza ainda sem tabela (fica para o próximo "Atualizar
-- referências" + nova coleta), CNAE pelo código.
UPDATE "leads" l
SET "municipioId" = m."id"
FROM "municipios" m
WHERE l."origem" = 'receita'
  AND l."municipioId" IS NULL
  AND m."deletedAt" IS NULL
  AND m."codigoIbge" = l."dadosReceita"->>'codigo_municipio_ibge';

UPDATE "lead_cnaes" lc
SET "cnaeId" = c."id"
FROM "cnaes" c
WHERE lc."cnaeId" IS NULL
  AND c."codigoErp" = lc."codigo";

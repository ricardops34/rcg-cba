-- Hierarquia comercial em **um ponteiro só**: `superiorId`.
--
-- Havia dois campos independentes no cadastro de vendedor, `supervisorId` e
-- `gerenteId`, e a independência era o defeito: dava para gravar um vendedor
-- sob o supervisor S e, ao mesmo tempo, sob o gerente G1, enquanto S respondia
-- a G2. As duas leituras do sistema então discordavam — o escopo de acesso
-- (`resolverEscopoVendedores`) punha o vendedor no time de G1; o agrupamento
-- do Dashboard Gerencial o mostrava sob S. Decisão do usuário em 2026-09-03:
-- cada cadastro aponta **a quem responde**, e a cadeia sobe sozinha (vendedor
-- → supervisor → gerente → o que houver acima), sem número fixo de níveis.
--
-- Conversão: o supervisor manda; quem não tinha supervisor herda o gerente.
-- É a leitura fiel do que os dois campos queriam dizer — o segundo era o
-- superior de quem não tinha o primeiro.
--
-- Ciclo (A responde a B e B responde a A) não é barrado pelo banco: fica no
-- service, que é onde a mensagem pode explicar o que houve.

ALTER TABLE "vendedores" ADD COLUMN "superiorId" TEXT;

UPDATE "vendedores"
SET "superiorId" = COALESCE("supervisorId", "gerenteId")
WHERE "supervisorId" IS NOT NULL OR "gerenteId" IS NOT NULL;

-- Um cadastro apontando para si mesmo já era possível (o banco não barrava) e
-- viraria um ciclo de um nó só na consulta recursiva. Some antes do índice.
UPDATE "vendedores" SET "superiorId" = NULL WHERE "superiorId" = "id";

ALTER TABLE "vendedores"
  ADD CONSTRAINT "vendedores_superiorId_fkey"
  FOREIGN KEY ("superiorId") REFERENCES "vendedores"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "vendedores_empresaId_superiorId_idx"
  ON "vendedores"("empresaId", "superiorId");

ALTER TABLE "vendedores" DROP CONSTRAINT IF EXISTS "vendedores_supervisorId_fkey";
ALTER TABLE "vendedores" DROP CONSTRAINT IF EXISTS "vendedores_gerenteId_fkey";
ALTER TABLE "vendedores" DROP COLUMN "supervisorId";
ALTER TABLE "vendedores" DROP COLUMN "gerenteId";

-- O papel deixa de ter um valor por degrau (supervisor, gerente) e passa a
-- dizer só se o cadastro **atende cliente** ou **responde por outros**: o
-- nível já está na cadeia `superiorId`, que não tem teto. Decisão do usuário
-- em 2026-09-03.
--
-- Postgres não remove valor de enum, então o tipo é recriado: os antigos
-- `supervisor` e `gerente` viram `superior`.
ALTER TYPE "TipoVendedor" RENAME TO "TipoVendedor_old";

CREATE TYPE "TipoVendedor" AS ENUM ('vendedor', 'superior');

ALTER TABLE "vendedores"
  ALTER COLUMN "tipo" DROP DEFAULT,
  ALTER COLUMN "tipo" TYPE "TipoVendedor"
    USING (
      CASE "tipo"::text
        WHEN 'vendedor' THEN 'vendedor'
        ELSE 'superior'
      END
    )::"TipoVendedor",
  ALTER COLUMN "tipo" SET DEFAULT 'vendedor';

DROP TYPE "TipoVendedor_old";

-- A origem da venda acompanha a mesma simplificação: não há mais como (nem por
-- que) distinguir supervisor de gerente, já que o cargo deixou de ter um valor
-- por degrau. Os dois viram `superior`.
ALTER TYPE "OrigemVenda" RENAME TO "OrigemVenda_old";

CREATE TYPE "OrigemVenda" AS ENUM ('vendedor', 'superior', 'administrador', 'cliente');

ALTER TABLE "orcamentos"
  ALTER COLUMN "origem" DROP DEFAULT,
  ALTER COLUMN "origem" TYPE "OrigemVenda"
    USING (
      CASE "origem"::text
        WHEN 'supervisor' THEN 'superior'
        WHEN 'gerente' THEN 'superior'
        ELSE "origem"::text
      END
    )::"OrigemVenda",
  ALTER COLUMN "origem" SET DEFAULT 'vendedor';

DROP TYPE "OrigemVenda_old";

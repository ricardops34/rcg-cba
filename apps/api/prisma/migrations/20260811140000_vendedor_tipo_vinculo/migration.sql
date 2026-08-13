-- Cadastro de vendedor: papel único, vínculo e uso em dashboard.
--
-- 1. `tipo` substitui os três booleanos vendedor/supervisor/gerente, que eram
--    independentes e aceitavam combinações sem sentido (na base de dev havia 9
--    vendedores com mais de um papel marcado, um deles com os três). Na
--    conversão o papel mais alto vence: gerente > supervisor > vendedor.
-- 2. `vinculo` (CLT / representante / sistema) classifica como o vendedor se
--    liga à empresa. O backfill é uma primeira classificação por nome, para
--    revisão na tela: cadastros operacionais viram `sistema`, razão social de
--    PJ vira `representante`, o resto entra como `clt`.
-- 3. `usaDashboard` marca quem aparece nas telas gerenciais. Começa ligado só
--    para quem tem carteira: vendedor sem cliente associado não tem o que
--    mostrar num dashboard.
-- 4. `desligado` passa a ser o controle de saída, e `ativo` vira seu espelho —
--    quem está desligado fica inativo, que é o que todos os selects do sistema
--    já consultam.
--
-- Sem policy nova: `vendedores` já tem RLS por empresaId, e aqui só mudam
-- colunas.

CREATE TYPE "TipoVendedor" AS ENUM ('vendedor', 'supervisor', 'gerente');
CREATE TYPE "VinculoVendedor" AS ENUM ('clt', 'representante', 'sistema');

ALTER TABLE "vendedores"
  ADD COLUMN "tipo"         "TipoVendedor" NOT NULL DEFAULT 'vendedor',
  ADD COLUMN "vinculo"      "VinculoVendedor",
  ADD COLUMN "usaDashboard" BOOLEAN NOT NULL DEFAULT true;

UPDATE "vendedores"
SET "tipo" = CASE
  WHEN "gerente"    THEN 'gerente'::"TipoVendedor"
  WHEN "supervisor" THEN 'supervisor'::"TipoVendedor"
  ELSE 'vendedor'::"TipoVendedor"
END;

-- Classificação inicial do vínculo. É um chute informado, não a verdade: a
-- tela de Vendedores é onde isso se corrige.
UPDATE "vendedores"
SET "vinculo" = CASE
  WHEN "nome" ~* '(ESCRITORIO|E-?COMMERCE|PECAS|ANIKY|BALCAO|INTERNO|^TEMP)'
    THEN 'sistema'::"VinculoVendedor"
  WHEN "nome" ~* '(LTDA|REPRES|EIRELI|EPP| ME$|MEI$)'
    THEN 'representante'::"VinculoVendedor"
  ELSE 'clt'::"VinculoVendedor"
END;

UPDATE "vendedores" v
SET "usaDashboard" = EXISTS (
  SELECT 1 FROM "clientes" c
  WHERE c."vendedorId" = v."id" AND c."deletedAt" IS NULL
);

-- `ativo` passa a espelhar `desligado` (daqui em diante o serviço mantém a
-- sincronia a cada gravação).
UPDATE "vendedores" SET "ativo" = false WHERE "desligado" = true;

ALTER TABLE "vendedores"
  DROP COLUMN "vendedor",
  DROP COLUMN "supervisor",
  DROP COLUMN "gerente";

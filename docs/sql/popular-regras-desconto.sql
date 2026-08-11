-- ---------------------------------------------------------------------------
-- Popula as Regras de Desconto (SZ0) e suas faixas.
--
-- SQL puro, sem meta-comandos do psql (\set etc.): roda tanto por linha de
-- comando quanto colado no pgAdmin/DBeaver.
--
-- A empresa é resolvida pelo ALIAS, não por id — os ids diferem entre dev e
-- produção. Para outra empresa (ex.: 'cba'), troque 'rcg' nos TRÊS pontos
-- marcados com "-- << ALIAS DA EMPRESA".
--
-- Uso na linha de comando (com a role dona, `plataforma`):
--   docker exec -i <container-postgres> psql -U plataforma -d <banco> \
--     < docs/sql/popular-regras-desconto.sql
--
-- Idempotente: rodar de novo não duplica nem sobrescreve o que já existe
-- (ON CONFLICT DO NOTHING nas duas tabelas). Para REaplicar uma regra depois
-- de editá-la, exclua-a pela tela antes.
-- ---------------------------------------------------------------------------

BEGIN;

-- Cabeçalhos ---------------------------------------------------------------
-- percDescontoAutorizado = Z0_DESCAUT ("% Desc. Aut")
-- percDescontoMaximo     = Z0_PERMAX  ("% Desc Max")
-- percComissao           = Z0_COMISS  (informativo: a comissão do item sai do
--                          % do vendedor × Base da faixa)
INSERT INTO "regras_desconto" (
  "id", "empresaId", "codigoErp", "descricao",
  "percDescontoAutorizado", "percDescontoMaximo", "percComissao",
  "padrao", "ativo", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, e."id", d."codigoErp", d."descricao",
  d."descAut", d."descMax", d."comissao",
  d."padrao", true, now(), now()
FROM "empresas" e
CROSS JOIN (VALUES
  ('000001', 'REGRA GERAL',               35, 30, 10, true),
  ('000002', 'LINHA DE PRODUTO ALLIA',    25, 20,  5, false),
  ('000003', 'PRODUTO SEM COMISSAO',       0,  0,  0, false),
  ('000004', 'PRODUTO EM PROMOCAO',        0,  0,  2, false),
  ('000005', 'BECKER MAXIMO 5% DESCONTO',  0,  5,  5, false)
) AS d("codigoErp", "descricao", "descAut", "descMax", "comissao", "padrao")
WHERE e."alias" = 'rcg'   -- << ALIAS DA EMPRESA
ON CONFLICT ("empresaId", "codigoErp") DO NOTHING;

-- Faixas -------------------------------------------------------------------
-- base = Z0_BASE: quanto da comissão do vendedor é paga naquele intervalo de
-- desconto. As faixas seguem a SZ0, com duas correções deliberadas:
--
--  1. REGRA GERAL não tem a seq 12 (37,01–99,99) e ALLIA não tem a seq 6
--     (25,01–99,99): no ERP elas se sobrepõem às seq 13 e 7, e a plataforma
--     recusa faixas sobrepostas. Ficou a mais recente de cada par — as duas
--     pagam 0% de comissão, então o resultado é o mesmo.
--
--  2. PRODUTO SEM COMISSAO e PRODUTO EM PROMOCAO estão com base 0, e não com
--     os 100 do ERP. Lá a base multiplica Z0_COMISS (que nessas regras é 0 e
--     2); aqui, por decisão de negócio, ela multiplica o % de comissão DO
--     VENDEDOR — com base 100, "produto sem comissão" pagaria a comissão
--     cheia do vendedor, o oposto do que a regra quer dizer. Se preferir
--     espelhar o ERP literalmente, troque os dois 0 abaixo por 100.
INSERT INTO "regras_desconto_faixas" (
  "id", "empresaId", "regraDescontoId", "sequencia",
  "percInicial", "percFinal", "percBaseComissao", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, r."empresaId", r."id", f."sequencia",
  f."inicial", f."final", f."base", now(), now()
FROM "regras_desconto" r
JOIN "empresas" e ON e."id" = r."empresaId"
JOIN (VALUES
  -- REGRA GERAL
  ('000001',  1,  0.00, 10.00, 100),
  ('000001',  2, 10.01, 15.00,  90),
  ('000001',  3, 15.01, 20.00,  80),
  ('000001',  4, 20.01, 22.00,  70),
  ('000001',  5, 22.01, 23.00,  60),
  ('000001',  6, 23.01, 25.00,  50),
  ('000001',  7, 25.01, 27.00,  40),
  ('000001',  8, 27.01, 30.00,  30),
  ('000001',  9, 30.01, 33.00,  20),
  ('000001', 10, 33.01, 35.00,  10),
  ('000001', 11, 35.01, 37.00,   5),
  ('000001', 13, 38.01, 99.99,   0),
  -- LINHA DE PRODUTO ALLIA
  ('000002',  1,  0.00,  5.00, 100),
  ('000002',  2,  5.01, 10.00,  80),
  ('000002',  3, 10.01, 15.00,  60),
  ('000002',  4, 15.01, 20.00,  40),
  ('000002',  5, 20.01, 25.00,  20),
  ('000002',  7, 25.02, 99.99,   0),
  -- Regras de faixa única (ver observação 2 acima sobre a base)
  ('000003',  1,  0.00, 99.99,   0),
  ('000004',  1,  0.00,  0.01,   0),
  ('000005',  1,  0.00,  5.00, 100)
) AS f("codigoErp", "sequencia", "inicial", "final", "base")
  ON f."codigoErp" = r."codigoErp"
WHERE e."alias" = 'rcg'   -- << ALIAS DA EMPRESA
ON CONFLICT ("regraDescontoId", "sequencia") DO NOTHING;

COMMIT;

-- Conferência --------------------------------------------------------------
SELECT
  r."codigoErp",
  r."descricao",
  r."percDescontoAutorizado" AS "desc_aut",
  r."percDescontoMaximo"     AS "desc_max",
  r."percComissao"           AS "comissao",
  r."padrao",
  count(f."id")              AS "faixas"
FROM "regras_desconto" r
JOIN "empresas" e ON e."id" = r."empresaId"
LEFT JOIN "regras_desconto_faixas" f ON f."regraDescontoId" = r."id"
WHERE e."alias" = 'rcg'   -- << ALIAS DA EMPRESA
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY 1;

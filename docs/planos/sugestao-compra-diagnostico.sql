-- Diagnóstico da sugestão de compra — SÓ LEITURA (nenhum INSERT/UPDATE/DELETE).
--
-- Para cada cliente que o lote considera elegível (ativo, não bloqueado, CNPJ,
-- com CNAE), diz por que ele está sem sugestão gravada, seguindo o mesmo
-- caminho de `gerarLinhasParaCliente` (sugestao-compra.service.ts):
--
--   1. pares     = outros clientes ativos cujo CNAE PRINCIPAL é exatamente o
--                  mesmo (7 dígitos) — sem par, o cálculo nem começa;
--   2. pares_ativos = desses, quantos compraram nos últimos 12 meses (a janela
--                  padrão; ajuste `meses` abaixo se SUGESTAO_COMPRA_MESES
--                  estiver diferente);
--   3. se o CNAE foi gravado DEPOIS do último lote concluído da empresa (ou
--      nunca houve lote), a falta de sugestão pode ser só lote atrasado.
--
-- Mostra também quantos pares o cliente teria comparando por classe (5
-- dígitos) e por grupo (3 dígitos), para medir o efeito de afrouxar a regra.

WITH params AS (
  SELECT (now() - interval '12 months') AS desde
),
elegiveis AS (
  SELECT c."id", c."empresaId"
  FROM "clientes" c
  WHERE c."deletedAt" IS NULL AND c."ativo" = true
    AND NOT (c."dataBloqueio" IS NOT NULL AND (c."dataReativacao" IS NULL OR c."dataReativacao" < c."dataBloqueio"))
    AND length(regexp_replace(COALESCE(c."cnpjCpf", ''), '[^0-9]', '', 'g')) = 14
    AND EXISTS (SELECT 1 FROM "cliente_cnaes" cc WHERE cc."clienteId" = c."id" AND cc."deletedAt" IS NULL)
),
-- Ramo do cliente: os principais; sem principal marcado, todos os CNAEs dele.
ramo AS (
  SELECT cc."clienteId", cc."empresaId", cc."cnaeId", k."codigoErp" AS codigo
  FROM "cliente_cnaes" cc
  JOIN "cnaes" k ON k."id" = cc."cnaeId"
  WHERE cc."deletedAt" IS NULL
    AND (cc."principal" OR NOT EXISTS (
      SELECT 1 FROM "cliente_cnaes" p
      WHERE p."clienteId" = cc."clienteId" AND p."principal" AND p."deletedAt" IS NULL))
),
-- Principal de cada cliente ativo (o lado "par" da comparação).
principais AS (
  SELECT cc."clienteId", cc."empresaId", cc."cnaeId", k."codigoErp" AS codigo
  FROM "cliente_cnaes" cc
  JOIN "cnaes" k ON k."id" = cc."cnaeId"
  JOIN "clientes" c ON c."id" = cc."clienteId" AND c."deletedAt" IS NULL AND c."ativo" = true
  WHERE cc."deletedAt" IS NULL AND cc."principal" = true
),
-- Quem comprou no período (mesma definição de venda do cálculo).
compradores AS (
  SELECT DISTINCT i."clienteId"
  FROM "notas_saida_itens" i
  JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
  WHERE i."produtoId" IS NOT NULL AND i."deletedAt" IS NULL AND i."ativo" = true
    AND i."dtEmissao" >= (SELECT desde FROM params)
    AND n."deletedAt" IS NULL AND n."ativo" = true AND n."comodato" = false AND n."tipo" = 'N'
    AND (n."geraDuplicata" = true OR (n."geraDuplicata" IS NULL AND n."condicaoPagamentoId" IS NOT NULL))
),
por_cliente AS (
  SELECT
    e."id", e."empresaId",
    (SELECT count(DISTINCT p."clienteId") FROM principais p
      WHERE p."empresaId" = e."empresaId" AND p."clienteId" <> e."id"
        AND p."cnaeId" IN (SELECT r."cnaeId" FROM ramo r WHERE r."clienteId" = e."id")) AS pares,
    (SELECT count(DISTINCT p."clienteId") FROM principais p
      JOIN compradores cp ON cp."clienteId" = p."clienteId"
      WHERE p."empresaId" = e."empresaId" AND p."clienteId" <> e."id"
        AND p."cnaeId" IN (SELECT r."cnaeId" FROM ramo r WHERE r."clienteId" = e."id")) AS pares_ativos,
    (SELECT count(DISTINCT p."clienteId") FROM principais p
      JOIN compradores cp ON cp."clienteId" = p."clienteId"
      WHERE p."empresaId" = e."empresaId" AND p."clienteId" <> e."id"
        AND left(p.codigo, 5) IN (SELECT left(r.codigo, 5) FROM ramo r WHERE r."clienteId" = e."id")) AS pares_ativos_classe,
    (SELECT count(DISTINCT p."clienteId") FROM principais p
      JOIN compradores cp ON cp."clienteId" = p."clienteId"
      WHERE p."empresaId" = e."empresaId" AND p."clienteId" <> e."id"
        AND left(p.codigo, 3) IN (SELECT left(r.codigo, 3) FROM ramo r WHERE r."clienteId" = e."id")) AS pares_ativos_grupo,
    EXISTS (SELECT 1 FROM compradores cp WHERE cp."clienteId" = e."id") AS comprou,
    -- Cliente calculado sem resultado não deixa linha: a referência é o
    -- último lote concluído da empresa (atenção: lote com faixa de código
    -- pode não ter passado por este cliente).
    (SELECT max(x."concluidaEm") FROM "sugestao_compra_execucoes" x
      WHERE x."empresaId" = e."empresaId" AND x."situacao" = 'concluida') AS calculado_em,
    (SELECT count(*) FROM "sugestoes_compra" s
      WHERE s."clienteId" = e."id" AND s."origem" = 'local') AS sugestoes,
    (SELECT max(cc."createdAt") FROM "cliente_cnaes" cc
      WHERE cc."clienteId" = e."id" AND cc."deletedAt" IS NULL) AS cnae_gravado_em
  FROM elegiveis e
)
SELECT
  emp."nomeFantasia" AS empresa,
  CASE
    WHEN pc.sugestoes > 0 THEN '0. tem sugestão'
    WHEN pc.pares = 0 THEN '1. ninguém com o mesmo CNAE principal'
    WHEN pc.pares_ativos = 0 THEN '2. pares sem compra em 12 meses'
    WHEN pc.calculado_em IS NULL OR pc.cnae_gravado_em > pc.calculado_em
      THEN '3. tem pares com compra — CNAE gravado depois do último lote (ou nunca houve lote)'
    ELSE '4. lote rodou depois do CNAE e não achou produto (ou a faixa não incluiu)'
  END AS situacao,
  count(*) AS clientes,
  count(*) FILTER (WHERE NOT pc.comprou) AS sem_compra_propria,
  round(avg(pc.pares_ativos), 1) AS media_pares_ativos_subclasse,
  count(*) FILTER (WHERE pc.pares_ativos = 0 AND pc.pares_ativos_classe > 0) AS ganharia_com_classe,
  count(*) FILTER (WHERE pc.pares_ativos = 0 AND pc.pares_ativos_grupo > 0) AS ganharia_com_grupo
FROM por_cliente pc
JOIN "empresas" emp ON emp."id" = pc."empresaId"
GROUP BY 1, 2
ORDER BY 1, 2;

-- Histórico dos lotes: o lote roda numa transação única com teto de 15 min.
-- Se a base inteira não couber, ele termina "falhou" e NÃO grava nada.
SELECT emp."nomeFantasia" AS empresa, x."situacao", x."iniciadaEm",
       x."concluidaEm" - x."iniciadaEm" AS duracao,
       x."parametros", x."resultado", left(x."erro", 150) AS erro
FROM "sugestao_compra_execucoes" x
JOIN "empresas" emp ON emp."id" = x."empresaId"
ORDER BY x."iniciadaEm" DESC
LIMIT 10;

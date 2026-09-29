-- A nota de saída passa a guardar se gerou duplicata (F2_DUPL do ERP). É o
-- que decide se ela é venda nas análises — ver `common/vendas/venda-analitica.ts`.
--
-- Por que: a nota de comodato, de bonificação e de transferência da RCG tem
-- condição de pagamento, então o critério antigo (`condicaoPagamentoId IS NOT
-- NULL`) a contava como venda. Conferido no ERP em 2026-09-29: o sistema
-- anterior conta a nota que gerou duplicata, com todos os itens; com essa
-- regra, 10 de 11 vendedores bateram ao centavo em 09/2026.
--
-- `geraDuplicata` nulo = "não sei" (integração que ainda não manda o campo) e
-- faz a análise cair no critério antigo. Não há policy nova: são colunas numa
-- tabela que já tem RLS.

ALTER TABLE "notas_saida"
  ADD COLUMN "duplicata" TEXT,
  ADD COLUMN "geraDuplicata" BOOLEAN;

-- Histórico: a nota gerou duplicata se existe título a receber com o mesmo
-- número, prefixo = série e mesmo cliente. O prefixo é comparado sem zeros à
-- esquerda: parte dos títulos antigos vem como '001' para a série '1' (748
-- notas no dump de produção de 2026-09-29).
--
-- Conferido no mesmo dump: das 113 mil notas normais, as ~5,7 mil sem título
-- são todas remessa (CFOP 5908, 5912, 5910, 5927, 5152, 5409…), nenhuma
-- 5102/5405, na mesma proporção desde 2010 — os títulos na base vêm de 2004,
-- então a falta de título não é falta de carga.
WITH titulos AS (
  SELECT DISTINCT
    "empresaId",
    "numero",
    LTRIM(TRIM(COALESCE("prefixo", '')), '0') AS "prefixo",
    "clienteId"
  FROM "titulos_receber"
  WHERE "deletedAt" IS NULL
)
UPDATE "notas_saida" n
SET "geraDuplicata" = true,
    "duplicata" = n."numero"
FROM titulos t
WHERE t."empresaId" = n."empresaId"
  AND t."numero" = n."numero"
  AND t."prefixo" = LTRIM(TRIM(COALESCE(n."serie", '')), '0')
  AND t."clienteId" IS NOT DISTINCT FROM n."clienteId";

UPDATE "notas_saida"
SET "geraDuplicata" = false
WHERE "geraDuplicata" IS NULL;

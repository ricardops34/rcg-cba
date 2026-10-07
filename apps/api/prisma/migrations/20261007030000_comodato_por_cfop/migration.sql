-- Comodato marcado pelo CFOP (ver `src/modules/integracao/common/comodato.ts`).
--
-- O ERP nunca mandou `comodato`: estava falso em todas as notas de saída,
-- inclusive nas remessas 5908/6908. Daqui em diante a integração marca pelo
-- CFOP; esta migration marca o histórico com a mesma regra:
--
-- - item: CFOP de remessa (saída 5908/6908) ou de retorno (entrada 1909/2909);
-- - cabeçalho: todos os itens vivos são de comodato. A nota mista — venda que
--   levou um equipamento em comodato junto — continua sendo venda.

ALTER TABLE "notas_entrada" ADD COLUMN "comodato" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "notas_entrada_itens" ADD COLUMN "comodato" BOOLEAN NOT NULL DEFAULT false;

UPDATE "notas_saida_itens"
   SET "comodato" = true
 WHERE btrim("cfop") IN ('5908', '6908')
   AND "comodato" = false;

UPDATE "notas_entrada_itens"
   SET "comodato" = true
 WHERE btrim("cfop") IN ('1909', '2909');

UPDATE "notas_saida" n
   SET "comodato" = true
 WHERE n."comodato" = false
   AND EXISTS (
         SELECT 1 FROM "notas_saida_itens" i
          WHERE i."notaSaidaId" = n."id" AND i."deletedAt" IS NULL AND i."ativo")
   AND NOT EXISTS (
         SELECT 1 FROM "notas_saida_itens" i
          WHERE i."notaSaidaId" = n."id" AND i."deletedAt" IS NULL AND i."ativo"
            AND i."comodato" = false);

UPDATE "notas_entrada" n
   SET "comodato" = true
 WHERE EXISTS (
         SELECT 1 FROM "notas_entrada_itens" i
          WHERE i."notaEntradaId" = n."id" AND i."deletedAt" IS NULL AND i."ativo")
   AND NOT EXISTS (
         SELECT 1 FROM "notas_entrada_itens" i
          WHERE i."notaEntradaId" = n."id" AND i."deletedAt" IS NULL AND i."ativo"
            AND i."comodato" = false);

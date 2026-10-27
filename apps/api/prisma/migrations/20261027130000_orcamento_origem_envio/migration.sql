-- Rastro do orçamento: onde nasceu e quando foi enviado
-- (docs/planos/2026-10-27-acompanhamento-equipe.md).
ALTER TABLE "orcamentos" ADD COLUMN "canalOrigem" TEXT;
ALTER TABLE "orcamentos" ADD COLUMN "conversaId" TEXT;
ALTER TABLE "orcamentos" ADD COLUMN "enviadoEm" TIMESTAMP(3);
ALTER TABLE "orcamentos" ADD COLUMN "canalEnvio" TEXT;

-- Orçamentos antigos: o primeiro envio/link do histórico (atividades ligadas
-- ao orçamento). A origem não é reconstruída: não há como saber onde nasceu.
UPDATE "orcamentos" o
   SET "enviadoEm" = e."quando",
       "canalEnvio" = e."canal"
  FROM (
    SELECT DISTINCT ON (a."orcamentoId")
           a."orcamentoId",
           a."createdAt" AS "quando",
           CASE WHEN a."titulo" LIKE 'Proposta enviada pelo WhatsApp%' THEN 'whatsapp' ELSE 'link' END AS "canal"
      FROM "atividades" a
     WHERE a."orcamentoId" IS NOT NULL
       AND (a."titulo" LIKE 'Proposta enviada pelo WhatsApp%' OR a."titulo" LIKE 'Link do orçamento%')
     ORDER BY a."orcamentoId", a."createdAt"
  ) e
 WHERE o."id" = e."orcamentoId" AND o."enviadoEm" IS NULL;

CREATE INDEX "orcamentos_empresaId_enviadoEm_idx" ON "orcamentos"("empresaId", "enviadoEm");

-- Orçamentos que o ERP importou ficaram com a origem padrão ('vendedor'), porque
-- o upsert da integração não gravava a origem. Quem os criou foi a integração
-- (createdBy 'integracao:…'): a origem passa a dizer isso.
UPDATE "orcamentos"
   SET "origem" = 'erp'
 WHERE "createdBy" LIKE 'integracao:%'
   AND "origem" <> 'erp';

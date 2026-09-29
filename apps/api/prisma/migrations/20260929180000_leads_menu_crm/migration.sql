-- Leads passa a integrar o menu CRM. Preserva rota, permissões e
-- configurações de disponibilidade de cada empresa.
UPDATE "menus"
SET "moduloId" = 'seed-modulo-crm'
WHERE "id" = 'seed-menu-leads'
  AND "moduloId" = 'seed-modulo-comercial'
  AND EXISTS (
    SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-crm'
  );

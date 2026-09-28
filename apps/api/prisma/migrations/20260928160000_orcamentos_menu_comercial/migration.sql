-- Orçamentos pertence ao menu Comercial. Preserva a rota, as permissões
-- e as configurações de disponibilidade de cada empresa.
UPDATE "menus"
SET "moduloId" = 'seed-modulo-comercial'
WHERE "id" = 'seed-menu-orcamentos'
  AND "moduloId" = 'seed-modulo-crm'
  AND EXISTS (
    SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-comercial'
  );

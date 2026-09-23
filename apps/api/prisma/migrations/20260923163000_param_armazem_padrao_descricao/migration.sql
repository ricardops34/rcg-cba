-- Explica na tela que o parâmetro aceita tanto a chave natural da integração
-- quanto o codigoErp, desde que este identifique um único armazém na empresa.

UPDATE "parametros_empresa"
SET
  "descricao" = 'Chave de integração ou código ERP do armazém usado quando armazemChave vier vazio',
  "updatedAt" = now()
WHERE "parametro" = 'ARMAZEM_PADRAO'
  AND "deletedAt" IS NULL;

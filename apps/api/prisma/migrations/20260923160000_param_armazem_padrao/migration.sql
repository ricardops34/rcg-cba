-- Armazém usado como fallback pela integração de produtos quando o ERP
-- omite armazemChave, envia null ou envia texto vazio.
--
-- O conteúdo nasce vazio: o Administrador da empresa deve informar a chave
-- natural de um armazém já cadastrado em Administração > Parâmetros.

INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  e."id",
  'ARMAZEM_PADRAO',
  'texto'::"TipoParametro",
  30,
  NULL,
  'Chave do armazém usada na integração de produtos quando armazemChave vier vazio',
  true,
  now(),
  now()
FROM "empresas" e
WHERE e."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "parametros_empresa" p
    WHERE p."empresaId" = e."id"
      AND p."parametro" = 'ARMAZEM_PADRAO'
  );

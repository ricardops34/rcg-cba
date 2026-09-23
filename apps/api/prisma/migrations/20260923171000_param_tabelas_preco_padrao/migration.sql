-- Tabelas de preço configuráveis por empresa. Os conteúdos nascem vazios:
-- o administrador informa a chave de integração ou o código ERP da tabela em
-- Administração > Parâmetros.

INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  e."id",
  p."parametro",
  'texto'::"TipoParametro",
  30,
  NULL,
  p."descricao",
  true,
  now(),
  now()
FROM "empresas" e
CROSS JOIN (
  VALUES
    ('TABELA_PRECO_PADRAO', 'Chave de integração ou código ERP da tabela de preço padrão da empresa'),
    ('TABELA_PRECO_CAPITAL', 'Chave de integração ou código ERP da tabela de preço usada para clientes da Capital'),
    ('TABELA_PRECO_INTERIOR', 'Chave de integração ou código ERP da tabela de preço usada para clientes do Interior')
) AS p("parametro", "descricao")
WHERE e."deletedAt" IS NULL
ON CONFLICT ("empresaId", "parametro") DO NOTHING;

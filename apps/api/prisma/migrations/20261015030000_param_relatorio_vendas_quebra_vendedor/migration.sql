-- Parâmetro novo do relatório "Vendas por vendedor" (mensal): liga/desliga o
-- agrupamento por vendedor na grade. Nasce ligado (`true`), como já se
-- comportava antes de o parâmetro existir. ON CONFLICT preserva o conteúdo
-- que a empresa já tenha configurado (reexecução/base restaurada).

INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  e."id",
  'RELATORIO_VENDAS_QUEBRA_VENDEDOR',
  'booleano'::"TipoParametro",
  NULL,
  'true',
  'Agrupa a grade de Vendas por vendedor (mensal) por vendedor, com subtotal; falso mostra só o cliente, somado entre vendedores',
  true,
  now(),
  now()
FROM "empresas" e
WHERE e."deletedAt" IS NULL
ON CONFLICT ("empresaId", "parametro") DO NOTHING;

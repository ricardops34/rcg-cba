-- A decisão de exibir fotos na proposta passa a valer para a empresa inteira.
-- O campo legado em produtos é mantido por compatibilidade com bancos e
-- integrações existentes, mas não é mais consultado pela aplicação.

INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  e."id",
  'ORCAMENTO_EXIBIR_FOTOS_PRODUTOS',
  'booleano'::"TipoParametro",
  NULL,
  'true',
  'Exibe a foto principal dos produtos nas propostas de orçamento',
  true,
  now(),
  now()
FROM "empresas" e
WHERE e."deletedAt" IS NULL
ON CONFLICT ("empresaId", "parametro") DO NOTHING;

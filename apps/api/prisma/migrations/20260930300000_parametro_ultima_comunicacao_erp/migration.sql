-- Data e hora da última comunicação do ERP com a plataforma. O integrador
-- chama POST /integracao/comunicacao no fim de cada execução de envio e de
-- retorno, e a API grava aqui a hora do servidor (ISO 8601). Nasce vazio;
-- ON CONFLICT preserva o que já existir.
INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  e."id",
  'ULTIMA_COMUNICACAO_ERP',
  'data'::"TipoParametro",
  NULL,
  NULL,
  'Data e hora da última comunicação do ERP com a plataforma (gravada pela integração)',
  true,
  now(),
  now()
FROM "empresas" e
WHERE e."deletedAt" IS NULL
ON CONFLICT ("empresaId", "parametro") DO NOTHING;

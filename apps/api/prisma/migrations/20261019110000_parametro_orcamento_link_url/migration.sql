-- Endereço base do link público do orçamento (ex.: https://plataforma.rcgdist.com.br).
-- Vazio usa o endereço do sistema (WEB_URL / CORS_ORIGIN). O seed não roda em
-- produção, então a linha entra aqui nas empresas existentes.
INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  e."id",
  'ORCAMENTO_LINK_URL_BASE',
  'texto'::"TipoParametro",
  200,
  NULL,
  'Endereço base do link do orçamento enviado ao cliente (ex.: https://plataforma.empresa.com.br); vazio usa o endereço do sistema',
  true,
  now(),
  now()
FROM "empresas" e
WHERE e."deletedAt" IS NULL
ON CONFLICT ("empresaId", "parametro") DO NOTHING;

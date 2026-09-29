-- Parâmetro com as séries de nota de saída que contam como venda nos
-- Dashboards (Comercial e Gerencial), nos Objetivos, nas Consultas e nas
-- ferramentas do WhatsApp do funcionário — todos leem o corte de
-- `common/vendas/venda-analitica.ts` (`corteDeVenda`).
--
-- Conteúdo: séries separadas por vírgula (ex.: `1` ou `1,3`). Vazio = todas.
--
-- Por que existe: a integração traz as séries 1 (NF-e de mercadoria) e 3 (RPS
-- de serviço), e o sistema que a plataforma substituiu apurava só a série 1.
-- Em 2026-09-29 o Dashboard Gerencial mostrou R$ 46 mil a mais para PECAS, que
-- eram exatamente as notas de série 3.
--
-- Nasce **vazio**, para não mudar o número de ninguém numa migration: a
-- empresa escolhe em Administração > Parâmetros. O `seed-base.ts` o cria nas
-- empresas novas (as duas listas precisam andar juntas).

INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  e."id",
  'VENDAS_SERIES_NOTA',
  'texto'::"TipoParametro",
  30,
  NULL,
  'Séries de nota de saída que contam como venda nos Dashboards e Consultas, separadas por vírgula (ex.: 1 ou 1,3); vazio considera todas',
  true,
  now(),
  now()
FROM "empresas" e
WHERE e."deletedAt" IS NULL
ON CONFLICT ("empresaId", "parametro") DO NOTHING;

-- Parâmetro com os CFOPs de item que não contam como venda nos Dashboards
-- (Comercial e Gerencial), nos Objetivos, nas Consultas e nas ferramentas do
-- WhatsApp do funcionário — todos leem o corte de
-- `common/vendas/venda-analitica.ts` (`corteDeVenda`).
--
-- Conteúdo: CFOPs separados por vírgula. Vazio = nenhum excluído.
--
-- Por que existe: o ERP emite a remessa em comodato (5908/6908) e a
-- bonificação/brinde (5910/6910) como itens dentro da nota de venda, e o
-- cabeçalho nunca vem marcado como comodato — o corte `comodato = false` não
-- os alcança. Na conferência de 2026-09-29 com o sistema anterior (dump da
-- produção), esses itens eram exatamente a diferença de ESCRITORIO (5910,
-- R$ 18.461,60), JOSUE, RUBENS e JOAO (5908).
--
-- Nasce **preenchido** com esses quatro CFOPs — decisão do usuário em
-- 2026-09-29. ON CONFLICT preserva o que a empresa já tiver configurado. O
-- `seed-base.ts` o cria nas empresas novas (as duas listas andam juntas).

INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  e."id",
  'VENDAS_CFOPS_EXCLUIDOS',
  'texto'::"TipoParametro",
  100,
  '5908,6908,5910,6910',
  'CFOPs de item que não contam como venda nos Dashboards e Consultas, separados por vírgula (padrão: comodato 5908/6908 e bonificação 5910/6910); vazio conta todos',
  true,
  now(),
  now()
FROM "empresas" e
WHERE e."deletedAt" IS NULL
ON CONFLICT ("empresaId", "parametro") DO NOTHING;

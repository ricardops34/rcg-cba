-- Tabela de preços usada no orçamento (nasce a do cadastro do cliente) e o
-- parâmetro que diz se o vendedor pode trocá-la.
ALTER TABLE "orcamentos" ADD COLUMN "tabelaPrecoId" TEXT;
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_tabelaPrecoId_fkey"
  FOREIGN KEY ("tabelaPrecoId") REFERENCES "tabelas_preco"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "orcamentos_empresaId_tabelaPrecoId_idx" ON "orcamentos"("empresaId", "tabelaPrecoId");

INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), e."id", 'ORCAMENTO_ALTERA_TABELA_PRECO', 'booleano'::"TipoParametro", NULL, 'false',
  'Permite ao vendedor trocar a tabela de preços no orçamento; falso usa sempre a do cadastro do cliente',
  true, now(), now()
FROM "empresas" e
WHERE e."deletedAt" IS NULL
ON CONFLICT ("empresaId", "parametro") DO NOTHING;

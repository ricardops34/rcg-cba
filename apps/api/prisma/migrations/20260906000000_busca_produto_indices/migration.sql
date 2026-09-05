-- Índices para a busca de produto do pré-atendimento.
--
-- A IA do número institucional procura produto pelo que o cliente descreve, e
-- isso varre descrição, valores de campo complementar e o **texto das fichas**.
-- Medido em dev com 4000 produtos e 4000 fichas (~9 MB de Markdown), com três
-- palavras de busca:
--
--   sem índice, pontuando todos os produtos ... 1139 ms
--   com estes índices, candidatos primeiro ....    0,8 ms
--
-- São duas mudanças, e as duas são necessárias: o índice, aqui, e a forma da
-- consulta (`ProdutoParaAgenteService.procurar`), que passou a filtrar por
-- índice antes de pontuar em vez de pontuar o catálogo inteiro para depois
-- ordenar.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- `unaccent` é STABLE, e índice de expressão exige IMMUTABLE. O invólucro fixa
-- o dicionário, que é justamente o que a torna determinística — sem isso o
-- Postgres recusa o índice.
--
-- A consulta **precisa** chamar `sem_acento(...)`, e não `unaccent(...)`: são
-- expressões diferentes para o planejador, e com a segunda o índice não é
-- usado.
CREATE OR REPLACE FUNCTION sem_acento(text) RETURNS text AS
  $$ SELECT unaccent('unaccent', $1) $$
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- GIN com trigramas é o que faz `ILIKE '%palavra%'` usar índice. B-tree não
-- serve: ele só ajuda quando o padrão é ancorado à esquerda ('palavra%').
CREATE INDEX IF NOT EXISTS produtos_busca_trgm_idx
  ON "produtos" USING gin (sem_acento("descricao") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS produto_fichas_busca_trgm_idx
  ON "produto_fichas" USING gin (sem_acento("markdown") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS produto_campo_valores_busca_trgm_idx
  ON "produto_campo_valores" USING gin (sem_acento("valor") gin_trgm_ops);

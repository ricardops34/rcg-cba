-- Busca vetorial nas fichas técnicas.
--
-- ## Funciona com e sem pgvector
--
-- A extensão `vector` precisa existir **no servidor de banco**, e nem todo
-- servidor tem. Esta migration não impõe isso: ela tenta criar a extensão e,
-- se não conseguir, segue em frente sem a coluna de vetor e sem o índice.
--
-- O resultado é que a tabela de trechos existe sempre. O corte das fichas em
-- pedaços, que é metade do ganho (contexto menor no modelo, busca mais
-- precisa), funciona em qualquer Postgres; a busca semântica é o que fica
-- desligada até alguém instalar a extensão.
--
-- Impor a extensão derrubaria o deploy inteiro de quem não a tem, por uma
-- funcionalidade que sabe degradar. Ver `docs/runbook-operacao.md` para
-- habilitá-la depois — a coluna e o índice entram pela migration seguinte, e o
-- texto dos trechos já estará gravado.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING
    'pgvector indisponível neste servidor: a busca semântica das fichas fica desligada e a busca por texto continua valendo. Detalhe: %',
    SQLERRM;
END
$$;

-- ## Por que trechos, e não a ficha inteira
--
-- Custo: mandar 10 KB de Markdown ao modelo a cada pergunta é o gasto que não
-- para de crescer. Precisão: o vetor de um documento inteiro é a média de tudo
-- que ele diz, e dilui o que é específico — que é justamente o que responde
-- "esse produto desgasta o tecido?".
--
-- CreateTable
CREATE TABLE "produto_ficha_trechos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "modelo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produto_ficha_trechos_pkey" PRIMARY KEY ("id")
);

-- A coluna do vetor e o índice só existem onde a extensão existe. A aplicação
-- consulta o catálogo para saber (`EmbeddingsService.bancoSuportaVetor`) e
-- desliga a metade semântica quando ela não está aqui.
--
-- 768 = `nomic-embed-text`, o modelo que roda no Ollama local (ver
-- docker-compose.dev.yml). pgvector exige a dimensão declarada para indexar,
-- então trocar para um modelo de outra dimensão obriga a recriar a coluna e
-- reindexar tudo — o serviço recusa vetor de tamanho diferente em vez de gravar
-- algo que a busca compararia com lixo.
--
-- HNSW com distância de cosseno: cosseno porque o que importa é a direção do
-- vetor (o assunto), não a magnitude; HNSW porque não precisa de treino prévio,
-- e aqui o índice nasce com a tabela vazia e é preenchido conforme as fichas
-- chegam.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE "produto_ficha_trechos" ADD COLUMN "embedding" vector(768);

    CREATE INDEX "produto_ficha_trechos_embedding_idx"
      ON "produto_ficha_trechos" USING hnsw ("embedding" vector_cosine_ops);
  END IF;
END
$$;

-- CreateIndex
CREATE INDEX "produto_ficha_trechos_empresaId_produtoId_idx" ON "produto_ficha_trechos"("empresaId", "produtoId");

-- CreateIndex
CREATE INDEX "produto_ficha_trechos_empresaId_fichaId_ordem_idx" ON "produto_ficha_trechos"("empresaId", "fichaId", "ordem");

-- AddForeignKey
ALTER TABLE "produto_ficha_trechos" ADD CONSTRAINT "produto_ficha_trechos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Apagar a ficha leva os trechos: trecho sem ficha é texto que ninguém sabe de
-- onde veio, e continuaria aparecendo na busca.
-- AddForeignKey
ALTER TABLE "produto_ficha_trechos" ADD CONSTRAINT "produto_ficha_trechos_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "produto_fichas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "produto_ficha_trechos" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_produto_ficha_trechos ON "produto_ficha_trechos"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "produto_ficha_trechos" TO plataforma_app;

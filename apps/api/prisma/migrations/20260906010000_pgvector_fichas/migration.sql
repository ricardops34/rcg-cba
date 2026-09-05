-- Busca vetorial nas fichas técnicas.
--
-- ## O que exige do servidor
--
-- A extensão `vector` (pgvector) precisa **existir no servidor de banco**. Em
-- dev ela vem da imagem `pgvector/pgvector:pg16` (ver docker-compose.dev.yml);
-- em produção o banco é externo, e é lá que ela precisa estar disponível. Se
-- não estiver, esta migration falha aqui, com a mensagem do Postgres dizendo
-- que a extensão não foi encontrada — que é melhor do que subir e a busca
-- semântica silenciosamente não existir.
CREATE EXTENSION IF NOT EXISTS vector;

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
    -- 1536 = `text-embedding-3-small`. pgvector exige a dimensão declarada para
    -- indexar, então trocar para um modelo de outra dimensão obriga a recriar a
    -- coluna e reindexar tudo — o serviço recusa vetor de tamanho diferente em
    -- vez de gravar algo que a busca compararia com lixo.
    "embedding" vector(1536),
    "modelo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produto_ficha_trechos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "produto_ficha_trechos_empresaId_produtoId_idx" ON "produto_ficha_trechos"("empresaId", "produtoId");

-- CreateIndex
CREATE INDEX "produto_ficha_trechos_empresaId_fichaId_ordem_idx" ON "produto_ficha_trechos"("empresaId", "fichaId", "ordem");

-- HNSW com distância de cosseno.
--
-- Cosseno, e não L2, porque o que importa é a direção do vetor (o assunto), não
-- a magnitude. HNSW, e não IVFFlat, porque não precisa de treino prévio: o
-- IVFFlat exige uma amostra representativa já gravada para construir as listas,
-- e aqui o índice nasce com a tabela vazia e é preenchido aos poucos, conforme
-- as fichas são importadas.
--
-- CreateIndex
CREATE INDEX "produto_ficha_trechos_embedding_idx"
  ON "produto_ficha_trechos" USING hnsw ("embedding" vector_cosine_ops);

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

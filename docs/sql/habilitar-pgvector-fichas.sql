-- Habilita a busca semântica das fichas técnicas num banco que subiu sem
-- pgvector.
--
-- ## Quando usar
--
-- A migration `20260906010000_pgvector_fichas` **não impõe** a extensão: se ela
-- não existir no servidor, a tabela de trechos nasce sem a coluna de vetor e o
-- sistema segue com a busca por texto. Este script é o segundo tempo — rode-o
-- depois de instalar a extensão no servidor.
--
-- Idempotente: rodar de novo não faz nada.
--
-- ## Ordem das coisas
--
-- 1. instalar a extensão no servidor (ver docs/runbook-operacao.md);
-- 2. rodar este script **com a role dona** (`plataforma`);
-- 3. em Administração > Agente IA, configurar o gerador de embeddings;
-- 4. `POST /produto-fichas-importacao/vetorizar` até devolver 0.
--
-- O passo 4 não relê PDF nenhum: o texto dos trechos já está gravado desde a
-- importação.

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'produto_ficha_trechos' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE "produto_ficha_trechos" ADD COLUMN "embedding" vector(768);

    CREATE INDEX "produto_ficha_trechos_embedding_idx"
      ON "produto_ficha_trechos" USING hnsw ("embedding" vector_cosine_ops);

    RAISE NOTICE 'Coluna de vetor criada. Configure o gerador de embeddings e rode a vetorização.';
  ELSE
    RAISE NOTICE 'A coluna de vetor já existia: nada a fazer.';
  END IF;
END
$$;

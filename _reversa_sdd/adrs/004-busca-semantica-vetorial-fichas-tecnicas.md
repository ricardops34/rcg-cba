# ADR 004 — Busca Semântica Vetorial em Fichas Técnicas via pgvector

- **Status:** Implementado 🟢
- **Data:** 2026-09-30 (Commit `c3e7cf5`)
- **Autores / Decisores:** Equipe de Inteligência Artificial & Backend

---

## 1. Contexto

A distribuidora comercializa milhares de itens técnicos (químicos, lubrificantes, autopeças, EPIs) com catálogos e fichas técnicas densas em formato PDF. Vendedores e clientes frequentemente buscam produtos descrevendo a aplicação em linguagem natural (ex.: *"produto para desengraxar chassi de trator sem agredir pintura"*, *"diluição recomendada para piso industrial de epóxi"*). 

A busca tradicional por palavras-chave (LIKE ou Full-Text Search) falhava sistematicamente por não compreender sinônimos, aplicações práticas ou variações de termos comerciais.

## 2. Decisão

Integrar a extensão nativa **pgvector** no PostgreSQL do sistema, gerando embeddings de texto para trechos de fichas técnicas (`produto_ficha_trechos`).

1. **Chunking e Extração:**
   - As fichas técnicas em PDF são fragmentadas em trechos semânticos relevantes (seções de aplicação, modo de uso, diluição, precauções).
2. **Geração de Embeddings:**
   - Embeddings vetoriais são calculados via modelo de linguagem e persistidos na coluna `embedding vector(1536)` (ou 768/384 conforme o modelo ativo).
3. **Busca por Similaridade de Cosseno:**
   - A busca semântica é executada via operador `<=>` (distância de cosseno) indexado com HNSW/IVFFlat, filtrando os trechos mais próximos à intenção do usuário.
4. **Alimentação do Agente de IA:**
   - O Agente de IA do WhatsApp utiliza esses trechos recuperados via RAG (Retrieval-Augmented Generation) para responder instantaneamente a dúvidas técnicas de clientes no WhatsApp com citações precisas da ficha do fabricante.

## 3. Alternativas Consideradas

- **Elasticsearch / OpenSearch:** Manter um cluster separado de busca textual/vetorial.
  - *Descarte:* Custo de infraestrutura muito elevado e necessidade de sincronização contínua de dados (dois bancos de dados).
- **Bancos Vetoriais Dedicados (Pinecone, Qdrant):**
  - *Descarte:* Risco de descompasso de dados e perda da garantia de transação ACID com as tabelas de produtos e RLS de empresa.

## 4. Consequências

### Positivas
- **Arquitetura Unificada:** Toda a busca vetorial vive dentro do mesmo Postgres da aplicação, beneficiando-se das mesmas rotinas de backup, réplica e RLS por empresa.
- **Precisão nas Respostas do WhatsApp:** O assistente não alucina diluições ou aplicações: cita exatamente o trecho extraído da ficha do produto.

### Negativas / Trade-offs
- **Dependência de Extensão Compilada:** Imagem Docker do Postgres deve obrigatoriamente incluir `pgvector/pgvector:pg16`.
- **Custo Computacional na Indexação:** Cargas massivas de fichas técnicas exigem processamento assíncrono para geração dos embeddings.


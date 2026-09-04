-- Restaura o role `whatsapp_store` e o schema `whatsapp`, perdidos na baseline.
--
-- A consolidação de 28/08 (`20260828220000_baseline`) trouxe o bloco de role do
-- `plataforma_app`, mas não o das migrations `20260815024500_whatsapp_store_schema`
-- e `20260815025500_whatsapp_store_search_path`. Numa base criada do zero pela
-- baseline — que é como o README manda recriar, inclusive a de produção — o role
-- e o schema simplesmente não existem, e o `whatsapp-worker` não sobe: a
-- biblioteca de sessão (`@zapo-js/store-postgres`) roda as migrations dela a
-- cada conexão e falha no primeiro CREATE TABLE.
--
-- Vai como migration nova, não como emenda na baseline: a baseline já foi
-- aplicada e o Prisma guarda o checksum dela.
--
-- Por que um role separado, e não o `plataforma_app`: a biblioteca precisa de
-- DDL permanente. Dar DDL ao role que fala com a internet desfaz exatamente a
-- separação de papéis do projeto (ver CLAUDE.md e o README deste diretório). A
-- saída é DDL só no espaço dela — `whatsapp_store` é dono do schema `whatsapp`
-- e não enxerga nada do `public`.
--
-- A senha abaixo é placeholder de desenvolvimento. Em produção, troque logo
-- após o deploy: quem tem essa senha alcança as sessões pareadas, ou seja,
-- fala pelo WhatsApp dos vendedores (ver docs/runbook-operacao.md).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'whatsapp_store') THEN
    CREATE ROLE whatsapp_store LOGIN PASSWORD 'whatsapp_store_dev_only'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS whatsapp AUTHORIZATION whatsapp_store;

-- DDL apenas dentro do próprio schema.
GRANT USAGE, CREATE ON SCHEMA whatsapp TO whatsapp_store;

-- E nada nas tabelas de negócio. Atenção ao que este REVOKE faz e ao que não
-- faz: ele tira o privilégio concedido diretamente a este role, mas **não** o
-- USAGE que todo role herda de `PUBLIC` no schema `public` — verificado em
-- cluster limpo, `has_schema_privilege('whatsapp_store','public','USAGE')`
-- continua `true` depois dele, e os nomes das tabelas aparecem no catálogo (que
-- é legível de qualquer jeito). Revogar de `PUBLIC` derrubaria junto o
-- `plataforma_app`, então não é o caminho.
--
-- O que de fato protege o dado é não haver GRANT: o `SELECT ... FROM
-- public.clientes` deste role responde "permission denied for table clientes",
-- porque os GRANTs do bloco 2 da baseline são só para `plataforma_app`. O
-- REVOKE fica como trava defensiva contra um GRANT direto futuro.
REVOKE ALL ON SCHEMA public FROM whatsapp_store;

-- O `?schema=` da URL é convenção do Prisma; o driver `pg` que a biblioteca usa
-- não o interpreta, e sem search_path o CREATE TABLE falha com "no schema has
-- been selected to create in". Fica no role, não na aplicação: vale para
-- qualquer conexão dele, inclusive um psql de investigação.
ALTER ROLE whatsapp_store SET search_path = whatsapp;

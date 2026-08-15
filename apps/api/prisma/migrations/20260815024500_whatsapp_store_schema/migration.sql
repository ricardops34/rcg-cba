-- Schema e role próprios para o store de sessão do WhatsApp.
--
-- Por que: a biblioteca (`@zapo-js/store-postgres`) roda as migrations dela a
-- **cada conexão**, não só na primeira — então ela precisa de DDL permanente.
-- Dar isso ao `plataforma_app` significaria DDL para o serviço que fala com a
-- internet, exatamente o que a separação de papéis existe para impedir
-- (ver CLAUDE.md e o README de migrations).
--
-- A saída é dar DDL só no espaço dela: `whatsapp_store` é dono do schema
-- `whatsapp` e **não tem acesso nenhum** às tabelas de negócio do schema
-- public. O worker conecta com esse role.
--
-- Mesmo precedente da migration `20260715221500_app_role_least_privilege`, que
-- criou o `plataforma_app`. A senha aqui é placeholder de desenvolvimento —
-- troque em produção logo após o primeiro deploy.

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

-- E nada no schema de negócio: sem USAGE, o role não enxerga sequer os nomes
-- das tabelas de clientes, notas e títulos.
REVOKE ALL ON SCHEMA public FROM whatsapp_store;

-- As tabelas `wa_*` criadas no schema public por um bootstrap anterior não são
-- mais usadas: o store passa a viver em `whatsapp`. Removidas para não deixar
-- credencial de sessão espalhada em dois lugares.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables
           WHERE schemaname = 'public' AND tablename LIKE 'wa\_%'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t.tablename);
  END LOOP;
END
$$;

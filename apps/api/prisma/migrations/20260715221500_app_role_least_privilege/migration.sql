-- Role de aplicação sem BYPASSRLS/superuser — pré-requisito para o RLS
-- (habilitado em 20260708002400_rls_empresa) realmente isolar as empresas.
--
-- Até aqui, tanto o dev-stack (docker/docker-compose.dev.yml) quanto o exemplo
-- de produção (docker/.env.prod.example) conectavam a API com o MESMO role
-- "plataforma" usado para rodar as migrations — role que, por ser dono das
-- tabelas (e nos ambientes observados, também superuser), IGNORA todas as
-- policies de RLS. Na prática o isolamento entre empresas dependia só do
-- `WHERE empresaId = ...` da aplicação; a camada de RLS no Postgres nunca
-- chegou a ser exercida.
--
-- "plataforma_app" é o role que a API passa a usar em runtime: LOGIN, mas
-- NOSUPERUSER e NOBYPASSRLS, e sem privilégio de DDL (NOCREATEDB/NOCREATEROLE).
-- As migrations continuam rodando com o role dono das tabelas ("plataforma"),
-- que segue com acesso total.
--
-- A senha abaixo é um valor de desenvolvimento (mesmo padrão já usado para o
-- role "plataforma" em docker-compose.dev.yml). Em produção, IMEDIATAMENTE
-- após o primeiro deploy desta migration, rode manualmente:
--   ALTER ROLE plataforma_app WITH PASSWORD '<senha-forte-gerada>';
-- e atualize a DATABASE_URL da API (não das migrations) para usar essa senha.
-- Rodar esta migration de novo (ex.: em outro ambiente) NÃO reseta a senha de
-- um role que já existe — o bloco abaixo só cria o role na primeira vez.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'plataforma_app') THEN
    CREATE ROLE plataforma_app WITH
      LOGIN
      NOSUPERUSER
      NOBYPASSRLS
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      PASSWORD 'plataforma_app_dev_only';
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO plataforma_app', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO plataforma_app;

-- Acesso de dados (DML) em todas as tabelas hoje existentes...
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO plataforma_app;

-- ...e nas que forem criadas por futuras migrations (rodadas pelo role
-- "plataforma", dono/migration runner em todos os ambientes), sem precisar
-- repetir este GRANT a cada tabela nova.
ALTER DEFAULT PRIVILEGES FOR ROLE plataforma IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO plataforma_app;

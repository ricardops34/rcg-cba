-- Row-Level Security por empresa (multi-tenant).
--
-- A aplicação define, por transação, a empresa ativa da requisição com:
--   SELECT set_config('app.current_empresa_id', '<uuid>', true);
-- (feito por PrismaService.withTenant em toda operação de negócio).
--
-- IMPORTANTE: RLS é ignorada por roles com atributo BYPASSRLS ou superusuário.
-- Em produção, a API deve conectar com um role de aplicação (sem BYPASSRLS),
-- distinto do role usado para rodar migrations.
--
-- "usuario_empresas" NÃO tem RLS: é a tabela de vínculo usada para descobrir
-- a quais empresas um usuário pertence durante o login — antes de existir uma
-- "empresa ativa" no contexto, então não há valor para o RLS filtrar contra.
-- Ela não guarda dado de negócio (só usuarioId/empresaId/perfilId), e o
-- filtro por usuário/empresa é feito pela aplicação em toda consulta.

ALTER TABLE "perfis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "colaboradores" ENABLE ROW LEVEL SECURITY;

-- empresaId é armazenado como texto (uuid gerado pela aplicação via Prisma),
-- por isso a comparação é texto-a-texto, sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_perfis ON "perfis"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY tenant_isolation_colaboradores ON "colaboradores"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

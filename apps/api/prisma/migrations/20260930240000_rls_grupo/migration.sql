-- RLS por grupo econômico em usuarios, empresas e grupos_economicos (etapa 2 e
-- 3 da RLS por grupo; a etapa 1 foi perfis, em 20260930210000_rls_perfis).
--
-- Quem é restringido: a requisição de usuário logado. O PrismaService informa,
-- a cada consulta, a empresa ativa, o usuário e se ele administra a plataforma
-- (common/prisma/contexto-banco.ts). Quem não administra fica preso ao grupo da
-- empresa ativa — mais o próprio cadastro e as empresas a que tem acesso.
--
-- Quem não é: o que roda sem usuário logado (jobs, webhooks, integração por
-- chave de API, login, refresh, portal). Para esses, o padrão do papel
-- plataforma_app passa a ser app.plataforma = 'on' ("modo sistema"): as três
-- tabelas ficam como eram antes de ter RLS, e nada que funciona hoje para de
-- funcionar em silêncio. A requisição logada desliga o modo explicitamente.
--
-- Roda com a role dona (plataforma), que não é afetada pela RLS.

-- 1. Funções de apoio -----------------------------------------------------------

-- O grupo da empresa informada. Passa a SECURITY DEFINER (dona das tabelas, sem
-- RLS): a policy de empresas usa esta função, e lê empresas — como invoker, a
-- leitura entraria na própria policy.
CREATE OR REPLACE FUNCTION app_grupo_atual() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT "grupoEconomicoId" FROM "empresas"
    WHERE "id" = NULLIF(current_setting('app.current_empresa_id', true), '')
  $$;

CREATE FUNCTION app_usuario_logado() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.usuario_logado', true), '') $$;

-- Empresas a que o usuário da requisição (ou o de withUsuario) tem acesso.
-- SECURITY DEFINER porque usuario_empresas tem RLS de tenant: por ela o
-- usuário só enxergaria o vínculo da empresa ativa.
CREATE FUNCTION app_empresas_do_usuario() RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT "empresaId" FROM "usuario_empresas"
    WHERE "ativo" = true
      AND "deletedAt" IS NULL
      AND "usuarioId" IN (
        app_usuario_logado(),
        NULLIF(current_setting('app.current_usuario_id', true), '')
      )
  $$;

-- Usuários com acesso ativo à empresa ativa (inclusive de outro grupo ou sem
-- grupo). Vínculo inativo não conta: é histórico, não acesso.
CREATE FUNCTION app_usuarios_da_empresa_atual() RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT "usuarioId" FROM "usuario_empresas"
    WHERE "empresaId" = NULLIF(current_setting('app.current_empresa_id', true), '')
      AND "ativo" = true
      AND "deletedAt" IS NULL
  $$;

-- 2. Dado: usuário sem grupo ganha o da empresa do vínculo ativo mais antigo
--    (uma conta é de um grupo só).
UPDATE "usuarios" u
SET "grupoEconomicoId" = r."grupoEconomicoId"
FROM (
  SELECT DISTINCT ON (ue."usuarioId") ue."usuarioId", e."grupoEconomicoId"
  FROM "usuario_empresas" ue
  JOIN "empresas" e ON e."id" = ue."empresaId"
  ORDER BY ue."usuarioId", ue."ativo" DESC, ue."createdAt" ASC
) r
WHERE r."usuarioId" = u."id" AND u."grupoEconomicoId" IS NULL;

-- 3. Padrão do papel da API: modo sistema ligado. Vale para conexão nova — a
--    API precisa reiniciar depois desta migration (o deploy já reinicia).
DO $$
BEGIN
  EXECUTE format(
    'ALTER ROLE plataforma_app IN DATABASE %I SET app.plataforma = %L',
    current_database(), 'on'
  );
END $$;

-- 4. empresas -------------------------------------------------------------------
ALTER TABLE "empresas" ENABLE ROW LEVEL SECURITY;

CREATE POLICY empresas_leitura ON "empresas" FOR SELECT USING (
  app_modo_plataforma()
  OR "id" = NULLIF(current_setting('app.current_empresa_id', true), '')
  OR "grupoEconomicoId" = app_grupo_atual()
  OR "id" IN (SELECT app_empresas_do_usuario())
);
-- Criar: no grupo da empresa ativa (o administrador do grupo cria empresa nele).
CREATE POLICY empresas_inclusao ON "empresas" FOR INSERT WITH CHECK (
  app_modo_plataforma() OR "grupoEconomicoId" = app_grupo_atual()
);
-- Alterar: o administrador de qualquer empresa do grupo edita as do grupo. Mover
-- empresa entre grupos passa pelo modo sistema (GruposEconomicosService).
CREATE POLICY empresas_alteracao ON "empresas" FOR UPDATE
  USING (
    app_modo_plataforma()
    OR "id" = NULLIF(current_setting('app.current_empresa_id', true), '')
    OR "grupoEconomicoId" = app_grupo_atual()
    OR "id" IN (SELECT app_empresas_do_usuario())
  )
  WITH CHECK (app_modo_plataforma() OR "grupoEconomicoId" = app_grupo_atual());
CREATE POLICY empresas_exclusao ON "empresas" FOR DELETE USING (app_modo_plataforma());

-- 5. usuarios -------------------------------------------------------------------
ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;

CREATE POLICY usuarios_leitura ON "usuarios" FOR SELECT USING (
  app_modo_plataforma()
  OR "id" = app_usuario_logado()
  OR "id" = NULLIF(current_setting('app.current_usuario_id', true), '')
  OR "grupoEconomicoId" = app_grupo_atual()
  OR "id" IN (SELECT app_usuarios_da_empresa_atual())
);
CREATE POLICY usuarios_inclusao ON "usuarios" FOR INSERT WITH CHECK (
  app_modo_plataforma() OR "grupoEconomicoId" = app_grupo_atual()
);
CREATE POLICY usuarios_alteracao ON "usuarios" FOR UPDATE
  USING (
    app_modo_plataforma()
    OR "id" = app_usuario_logado()
    OR "id" = NULLIF(current_setting('app.current_usuario_id', true), '')
    OR "grupoEconomicoId" = app_grupo_atual()
    OR "id" IN (SELECT app_usuarios_da_empresa_atual())
  )
  WITH CHECK (
    app_modo_plataforma()
    OR "grupoEconomicoId" = app_grupo_atual()
    OR "id" = app_usuario_logado()
    OR "id" = NULLIF(current_setting('app.current_usuario_id', true), '')
  );
CREATE POLICY usuarios_exclusao ON "usuarios" FOR DELETE USING (app_modo_plataforma());

-- 6. grupos_economicos ----------------------------------------------------------
ALTER TABLE "grupos_economicos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY grupos_leitura ON "grupos_economicos" FOR SELECT USING (
  app_modo_plataforma()
  OR "id" = app_grupo_atual()
  OR "id" = (SELECT u."grupoEconomicoId" FROM "usuarios" u WHERE u."id" = app_usuario_logado())
);
-- Criar grupo é da Plataforma; o grupo próprio de uma empresa excluída do grupo
-- nasce pelo modo sistema (GruposEconomicosService).
CREATE POLICY grupos_inclusao ON "grupos_economicos" FOR INSERT WITH CHECK (app_modo_plataforma());
CREATE POLICY grupos_alteracao ON "grupos_economicos" FOR UPDATE
  USING (app_modo_plataforma() OR "id" = app_grupo_atual())
  WITH CHECK (app_modo_plataforma() OR "id" = app_grupo_atual());
CREATE POLICY grupos_exclusao ON "grupos_economicos" FOR DELETE USING (app_modo_plataforma());

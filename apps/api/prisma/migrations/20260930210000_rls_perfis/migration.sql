-- RLS de perfis e perfil_permissoes (etapa 1 da RLS por grupo econômico).
--
-- Perfil tem dono desde 20260930200000_perfil_por_grupo: a plataforma
-- (grupoEconomicoId nulo) ou um grupo. Até aqui o corte entre grupos era só
-- código (PerfisService). Agora o banco também segura.
--
-- O contexto chega por set_config, na mesma transação da consulta:
--   app.current_empresa_id — empresa ativa; o grupo sai dela (app_grupo_atual)
--   app.plataforma = 'on'  — administrador da plataforma
--   app.current_usuario_id — withUsuario (login, /me): o próprio usuário
-- Numa requisição autenticada o PrismaService informa os dois primeiros sozinho
-- (ver common/prisma/contexto-banco.ts); fora dela, withTenant/withUsuario.

-- Grupo econômico da empresa informada na transação. STABLE: lida uma vez por
-- comando. SECURITY INVOKER (padrão): quando empresas ganhar RLS, a empresa
-- ativa continua visível para quem está nela.
CREATE FUNCTION app_grupo_atual() RETURNS text
  LANGUAGE sql STABLE
  AS $$
    SELECT "grupoEconomicoId" FROM "empresas"
    WHERE "id" = NULLIF(current_setting('app.current_empresa_id', true), '')
  $$;

CREATE FUNCTION app_modo_plataforma() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(current_setting('app.plataforma', true), '') = 'on' $$;

-- perfis ---------------------------------------------------------------------
ALTER TABLE "perfis" ENABLE ROW LEVEL SECURITY;

-- Leitura: os da plataforma são referência para todos (inclusive o login, antes
-- de haver empresa); os de grupo, só para o próprio grupo, para a plataforma e
-- para o usuário que tem vínculo com o perfil (login/me via withUsuario, que
-- zera a empresa).
CREATE POLICY perfis_leitura ON "perfis" FOR SELECT USING (
  "grupoEconomicoId" IS NULL
  OR app_modo_plataforma()
  OR "grupoEconomicoId" = app_grupo_atual()
  OR EXISTS (
    SELECT 1 FROM "usuario_empresas" ue
    WHERE ue."perfilId" = "perfis"."id"
      AND ue."usuarioId" = current_setting('app.current_usuario_id', true)
  )
);

-- Escrita: perfil da plataforma só no modo plataforma; de grupo, só no grupo
-- da empresa ativa. É a mesma regra de PerfisService.garantirPodeAlterar.
CREATE POLICY perfis_inclusao ON "perfis" FOR INSERT WITH CHECK (
  app_modo_plataforma() OR "grupoEconomicoId" = app_grupo_atual()
);
CREATE POLICY perfis_alteracao ON "perfis" FOR UPDATE
  USING (app_modo_plataforma() OR "grupoEconomicoId" = app_grupo_atual())
  WITH CHECK (app_modo_plataforma() OR "grupoEconomicoId" = app_grupo_atual());
CREATE POLICY perfis_exclusao ON "perfis" FOR DELETE USING (
  app_modo_plataforma() OR "grupoEconomicoId" = app_grupo_atual()
);

-- perfil_permissoes ------------------------------------------------------------
ALTER TABLE "perfil_permissoes" ENABLE ROW LEVEL SECURITY;

-- Leitura: segue a do perfil (o EXISTS em perfis já passa pela RLS dele).
CREATE POLICY perfil_permissoes_leitura ON "perfil_permissoes" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "perfis" p WHERE p."id" = "perfil_permissoes"."perfilId")
);

-- Escrita: só em perfil que o contexto pode alterar.
CREATE POLICY perfil_permissoes_inclusao ON "perfil_permissoes" FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM "perfis" p
    WHERE p."id" = "perfil_permissoes"."perfilId"
      AND (app_modo_plataforma() OR p."grupoEconomicoId" = app_grupo_atual())
  )
);
CREATE POLICY perfil_permissoes_alteracao ON "perfil_permissoes" FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "perfis" p
      WHERE p."id" = "perfil_permissoes"."perfilId"
        AND (app_modo_plataforma() OR p."grupoEconomicoId" = app_grupo_atual())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "perfis" p
      WHERE p."id" = "perfil_permissoes"."perfilId"
        AND (app_modo_plataforma() OR p."grupoEconomicoId" = app_grupo_atual())
    )
  );
CREATE POLICY perfil_permissoes_exclusao ON "perfil_permissoes" FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM "perfis" p
    WHERE p."id" = "perfil_permissoes"."perfilId"
      AND (app_modo_plataforma() OR p."grupoEconomicoId" = app_grupo_atual())
  )
);

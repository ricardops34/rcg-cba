-- Separa administrador da plataforma do administrador de cada tenant.
-- Nenhuma conta existente Ã© promovida automaticamente: depois do deploy, o
-- operador deve executar, com a role owner e para a conta escolhida:
--   UPDATE "usuarios" SET "administradorPlataforma" = true WHERE "email" = '...';
ALTER TABLE "usuarios"
  ADD COLUMN "administradorPlataforma" BOOLEAN NOT NULL DEFAULT false;

-- Credenciais do portal precisam ser encontradas antes do tenant autenticado.
-- A policy prÃ©-tenant abre somente a credencial exata indicada pela transaÃ§Ã£o;
-- operaÃ§Ãµes administrativas continuam usando a policy normal do tenant.
ALTER TABLE "portal_cliente_credenciais" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_portal_cliente_credenciais
  ON "portal_cliente_credenciais"
  USING ("empresaId" = current_setting('app.current_empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY portal_login_portal_cliente_credenciais
  ON "portal_cliente_credenciais"
  USING (
    "id"::text = current_setting('app.current_portal_credential_id', true)
    OR (
      "empresaAlias" = current_setting('app.current_portal_empresa_alias', true)
      AND "emailNormalizado" = current_setting('app.current_portal_email', true)
    )
  )
  WITH CHECK (
    "id"::text = current_setting('app.current_portal_credential_id', true)
    OR (
      "empresaAlias" = current_setting('app.current_portal_empresa_alias', true)
      AND "emailNormalizado" = current_setting('app.current_portal_email', true)
    )
  );

ALTER TABLE "portal_cliente_acessos_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_portal_cliente_acessos_log
  ON "portal_cliente_acessos_log"
  USING ("empresaId" = current_setting('app.current_empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.current_empresa_id', true));

-- Login invÃ¡lido tambÃ©m precisa ser auditado, inclusive quando a empresa nÃ£o
-- existe. A role pode inserir apenas a linha cujo e-mail/empresa coincidem com
-- o contexto local; esta policy nÃ£o concede SELECT.
CREATE POLICY portal_insert_portal_cliente_acessos_log
  ON "portal_cliente_acessos_log"
  FOR INSERT
  WITH CHECK (
    "email" = current_setting('app.current_portal_audit_email', true)
    AND COALESCE("empresaId", '') = current_setting('app.current_portal_audit_empresa_id', true)
  );

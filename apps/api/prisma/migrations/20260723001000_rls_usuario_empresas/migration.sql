-- usuario_empresas passou a carregar dado de negócio (cargo, hierarquia,
-- dados pessoais do vendedor — ver migration anterior), então deixa de ser
-- exceção de RLS. Duas policies permissivas (Postgres combina com OR):
--
-- 1) tenant_isolation: mesma regra das demais tabelas de negócio — só vê
--    vínculos da empresa ativa. Cobre telas admin (listar/editar usuários e
--    vendedores de uma empresa).
-- 2) self_usuario_empresas: usuário sempre enxerga os PRÓPRIOS vínculos,
--    em qualquer empresa, independente de current_empresa_id. Necessário
--    porque login (login/refresh/switch-empresa) e AuthService.me() precisam
--    descobrir a quais empresas o usuário pertence ANTES de existir uma
--    empresa ativa no contexto — ver PrismaService.withUsuario.
ALTER TABLE "usuario_empresas" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_usuario_empresas ON "usuario_empresas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

CREATE POLICY self_usuario_empresas ON "usuario_empresas"
  USING ("usuarioId" = current_setting('app.current_usuario_id', true));

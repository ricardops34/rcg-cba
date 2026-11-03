-- Entrada no rastro de acessos (Administração > Acessos) de cada início de
-- personificação.
ALTER TYPE "AcessoEvento" ADD VALUE IF NOT EXISTS 'personificacao_iniciada';

-- Log auditado de "Testar como este usuário" (personificação): o administrador
-- da empresa acessa com o perfil de um usuário dela, sem a senha dele e sem
-- derrubar a sessão real do usuário alvo (o token é emitido à parte, sem
-- Sessao/RefreshToken próprios — ver AuthService.personificar).
CREATE TABLE "usuario_personificacao_logs" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "administradorId" TEXT NOT NULL,
    "usuarioAlvoId" TEXT NOT NULL,
    "metodoHttp" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "payload" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_personificacao_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "usuario_personificacao_logs_empresaId_createdAt_idx" ON "usuario_personificacao_logs"("empresaId", "createdAt");

ALTER TABLE "usuario_personificacao_logs" ADD CONSTRAINT "usuario_personificacao_logs_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usuario_personificacao_logs" ADD CONSTRAINT "usuario_personificacao_logs_administradorId_fkey" FOREIGN KEY ("administradorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usuario_personificacao_logs" ADD CONSTRAINT "usuario_personificacao_logs_usuarioAlvoId_fkey" FOREIGN KEY ("usuarioAlvoId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "usuario_personificacao_logs" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_usuario_personificacao_logs ON "usuario_personificacao_logs"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

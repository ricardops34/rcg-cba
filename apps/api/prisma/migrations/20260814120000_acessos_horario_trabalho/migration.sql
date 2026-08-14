-- Auditoria de acesso (Administração > Acessos) e restrição de expediente por
-- usuário.
--
-- Três tabelas novas:
--   * usuario_horarios — faixa de expediente por dia da semana, com o flag
--     usuarios."restringirHorario" ligando/desligando a trava por usuário.
--   * sessoes          — do login ao logout, base do "tempo de uso".
--   * acessos_log      — cada tentativa de autenticação e seu desfecho,
--                        inclusive as que falharam.
--
-- NENHUMA delas recebe Row-Level Security, pela mesma razão já documentada
-- para refresh_tokens em prisma/migrations/README.md: são escritas no fluxo de
-- login, ANTES de existir empresa ativa no contexto (o e-mail de uma tentativa
-- sem sucesso pode nem corresponder a um usuário). O "empresaId" de sessoes e
-- acessos_log é informativo, nullable, e o corte por empresa é feito na
-- consulta (AcessosService), restrito aos usuários com vínculo na empresa
-- ativa. usuario_horarios sequer tem empresaId: a trava é da conta, como a
-- política de senha.

-- CreateEnum
CREATE TYPE "AcessoEvento" AS ENUM ('login_sucesso', 'login_falha', 'login_bloqueado', 'login_fora_horario', 'acesso_fora_horario', 'logout', 'troca_empresa');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "restringirHorario" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "usuario_horarios" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFim" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "usuario_horarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_horarios_usuarioId_diaSemana_key" ON "usuario_horarios"("usuarioId", "diaSemana");

-- AddForeignKey
ALTER TABLE "usuario_horarios" ADD CONSTRAINT "usuario_horarios_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "sessoes" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaAtividadeEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encerradaEm" TIMESTAMP(3),
    "motivoFim" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessoes_usuarioId_iniciadaEm_idx" ON "sessoes"("usuarioId", "iniciadaEm");

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "sessaoId" TEXT;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "sessoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "acessos_log" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "email" TEXT NOT NULL,
    "empresaId" TEXT,
    "evento" "AcessoEvento" NOT NULL,
    "detalhe" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acessos_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "acessos_log_criadoEm_idx" ON "acessos_log"("criadoEm");

-- CreateIndex
CREATE INDEX "acessos_log_usuarioId_criadoEm_idx" ON "acessos_log"("usuarioId", "criadoEm");

-- AddForeignKey
ALTER TABLE "acessos_log" ADD CONSTRAINT "acessos_log_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Menu e rotina da tela nova, no módulo Administração (mesmo padrão da
-- migration de parâmetros).
INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-menu-acessos',
  'seed-modulo-administracao',
  'Acessos',
  'history',
  '/admin/acessos',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-administracao'),
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-rotina-acessos',
  'seed-menu-acessos',
  'Acessos',
  'acessos',
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  'seed-perm-acessos-' || p."id" || '-' || a."acao",
  p."id",
  'seed-rotina-acessos',
  a."acao"::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN (
  SELECT unnest(ARRAY[
    'visualizar', 'cadastrar', 'editar', 'excluir',
    'importar', 'exportar', 'aprovar', 'cancelar', 'bloquear'
  ]) AS "acao"
) a
WHERE p."nome" = 'Administrador'
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

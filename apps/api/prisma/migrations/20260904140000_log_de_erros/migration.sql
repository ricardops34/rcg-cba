-- Log de erros em Plataforma > Erros (docs/planos/log-de-erros.md).
--
-- A tabela `audit_logs` já existia e nunca foi usada: nenhuma referência no
-- código, zero linhas. Em vez de criar uma quinta tabela de log ao lado de uma
-- órfã, ela é ocupada aqui — as colunas antigas eram de auditoria de alteração
-- (entidade/ação/valorAnterior) e não descrevem um erro, então saem.
--
-- O DROP das colunas é seguro justamente porque a tabela está vazia; se este
-- script rodar numa base onde alguém escreveu nela, o conteúdo se perde. Foi
-- conferido antes: 0 linhas em dev e nenhuma escrita no código.

-- ------------------------------------------------------------------ enums

CREATE TYPE "ErroOrigem" AS ENUM ('servidor', 'cliente');

CREATE TYPE "ErroTipo" AS ENUM (
  'excecao',
  'http',
  'rede',
  'resposta',
  'javascript',
  'promessa'
);

-- ------------------------------------------------------- audit_logs → erros

DROP INDEX IF EXISTS "audit_logs_entidade_entidadeId_idx";

ALTER TABLE "audit_logs"
  DROP COLUMN IF EXISTS "entidade",
  DROP COLUMN IF EXISTS "entidadeId",
  DROP COLUMN IF EXISTS "acao",
  DROP COLUMN IF EXISTS "valorAnterior",
  DROP COLUMN IF EXISTS "valorNovo";

ALTER TABLE "audit_logs"
  ADD COLUMN "origem"     "ErroOrigem" NOT NULL,
  ADD COLUMN "tipo"       "ErroTipo"   NOT NULL,
  ADD COLUMN "ocorridoEm" TIMESTAMP(3) NOT NULL,
  ADD COLUMN "ultimaEm"   TIMESTAMP(3) NOT NULL,
  ADD COLUMN "ocorrencias" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "rota"       TEXT NOT NULL,
  ADD COLUMN "rotaPadrao" TEXT NOT NULL,
  ADD COLUMN "metodo"     TEXT,
  ADD COLUMN "status"     INTEGER,
  ADD COLUMN "pagina"     TEXT,
  ADD COLUMN "mensagem"   TEXT NOT NULL,
  ADD COLUMN "resumo"     TEXT NOT NULL,
  ADD COLUMN "stack"      TEXT,
  ADD COLUMN "assinatura" TEXT NOT NULL,
  ADD COLUMN "usuarioEmail" TEXT,
  ADD COLUMN "empresaId"    TEXT,
  ADD COLUMN "empresaRazaoSocial" TEXT;

CREATE INDEX "audit_logs_assinatura_ultimaEm_idx" ON "audit_logs" ("assinatura", "ultimaEm");
CREATE INDEX "audit_logs_ultimaEm_idx" ON "audit_logs" ("ultimaEm");
CREATE INDEX "audit_logs_empresaId_ultimaEm_idx" ON "audit_logs" ("empresaId", "ultimaEm");

-- Sem RLS, de propósito — mesma exceção de `plataforma_auditoria`: quem lê é a
-- administração da plataforma, e ela lê todas as empresas. Uma policy de
-- tenant devolveria vazio justamente para quem precisa enxergar. O `empresaId`
-- é informativo (nulo quando o erro acontece antes de haver empresa ativa).
-- Ver apps/api/prisma/migrations/README.md, seção de exceções.

-- --------------------------------------------------------------- governança

CREATE TABLE "erros_log_config" (
  "id"             TEXT NOT NULL DEFAULT 'unico',
  "retencaoDias"   INTEGER NOT NULL DEFAULT 30,
  "tetoPorEmpresa" INTEGER NOT NULL DEFAULT 5000,
  "registrar4xx"   BOOLEAN NOT NULL DEFAULT false,
  "atualizadoEm"   TIMESTAMP(3) NOT NULL,
  "atualizadoPor"  TEXT,

  CONSTRAINT "erros_log_config_pkey" PRIMARY KEY ("id")
);

-- A linha única nasce aqui: o serviço lê a configuração no caminho quente (a
-- cada erro gravado) e não deveria ter de criá-la sob concorrência.
INSERT INTO "erros_log_config" ("id", "atualizadoEm") VALUES ('unico', NOW());

-- Configuração da plataforma, não de empresa: sem `empresaId`, logo sem RLS.

-- Backup por empresa (docs/planos/2026-10-13-backup-por-empresa.md).
--
-- Um pacote por empresa e data — dados e arquivos num zip, no armazenamento —
-- gerado sob demanda ou pelo agendamento. Só a administração da plataforma
-- gera e baixa.

CREATE TYPE "BackupEmpresaOrigem" AS ENUM ('manual', 'agendado');
CREATE TYPE "BackupEmpresaSituacao" AS ENUM ('gerando', 'pronto', 'falhou');

CREATE TABLE "empresa_backups" (
  "id"            TEXT NOT NULL,
  "empresaId"     TEXT NOT NULL,
  "origem"        "BackupEmpresaOrigem" NOT NULL,
  "situacao"      "BackupEmpresaSituacao" NOT NULL DEFAULT 'gerando',
  "chave"         TEXT,
  "bytes"         BIGINT,
  "registros"     INTEGER,
  "arquivos"      INTEGER,
  "erro"          TEXT,
  "solicitadoPor" TEXT,
  "iniciadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "concluidoEm"   TIMESTAMP(3),
  CONSTRAINT "empresa_backups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "empresa_backups_empresaId_fkey" FOREIGN KEY ("empresaId")
    REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "empresa_backups_empresaId_iniciadoEm_idx"
  ON "empresa_backups"("empresaId", "iniciadoEm");

-- Um backup gerando por empresa: dois ao mesmo tempo leriam a base duas vezes
-- e disputariam o disco temporário. Índice parcial (o Prisma não representa).
CREATE UNIQUE INDEX "empresa_backups_um_gerando"
  ON "empresa_backups"("empresaId") WHERE "situacao" = 'gerando';

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "empresa_backups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_empresa_backups ON "empresa_backups"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- Agendamento: linha única, global (sem empresaId, sem RLS), como erros_log_config.
CREATE TABLE "backup_empresas_config" (
  "id"             TEXT NOT NULL DEFAULT 'unico',
  "ativo"          BOOLEAN NOT NULL DEFAULT true,
  "frequenciaDias" INTEGER NOT NULL DEFAULT 7,
  "manter"         INTEGER NOT NULL DEFAULT 4,
  "atualizadoEm"   TIMESTAMP(3) NOT NULL,
  "atualizadoPor"  TEXT,
  CONSTRAINT "backup_empresas_config_pkey" PRIMARY KEY ("id")
);

-- O papel da API (`plataforma_app`) lê e grava as duas tabelas.
GRANT SELECT, INSERT, UPDATE, DELETE ON "empresa_backups" TO plataforma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "backup_empresas_config" TO plataforma_app;

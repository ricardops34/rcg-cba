-- App no celular (plano docs/planos/2026-11-10-app-celular.md).
--
-- 1. Sessão única por TIPO de aparelho: a sessão ganha "computador"/"celular".
--    Sessões já abertas ficam como computador — o pior caso é o próximo login
--    de celular derrubar uma sessão de celular antiga marcada errado.
-- 2. Assinaturas de Web Push por aparelho. Tabela por usuário, sem empresaId
--    (como `sessoes`), portanto sem RLS por empresa.
-- 3. Fila de saída do push em `notificacoes.pushEm`. As linhas existentes
--    entram como já tratadas: sem isso o primeiro envio dispararia no celular
--    tudo o que está não lido no sino.

ALTER TABLE "sessoes" ADD COLUMN "aparelho" TEXT NOT NULL DEFAULT 'computador';

CREATE TABLE "push_assinaturas" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "sessaoId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoEnvioEm" TIMESTAMP(3),

    CONSTRAINT "push_assinaturas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_assinaturas_endpoint_key" ON "push_assinaturas"("endpoint");
CREATE INDEX "push_assinaturas_usuarioId_idx" ON "push_assinaturas"("usuarioId");

ALTER TABLE "push_assinaturas" ADD CONSTRAINT "push_assinaturas_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "push_assinaturas" ADD CONSTRAINT "push_assinaturas_sessaoId_fkey"
  FOREIGN KEY ("sessaoId") REFERENCES "sessoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "push_assinaturas" TO plataforma_app;

ALTER TABLE "notificacoes" ADD COLUMN "pushEm" TIMESTAMP(3);
UPDATE "notificacoes" SET "pushEm" = CURRENT_TIMESTAMP;

-- O envio pergunta só pelo que está na fila; o índice parcial fica do tamanho dela.
CREATE INDEX "notificacoes_push_pendente" ON "notificacoes" ("empresaId", "criadaEm")
  WHERE "pushEm" IS NULL;

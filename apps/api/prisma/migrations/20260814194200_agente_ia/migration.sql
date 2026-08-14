
-- CreateEnum
CREATE TYPE "AgentePapel" AS ENUM ('usuario', 'sistema', 'assistente', 'ferramenta');

-- CreateTable
CREATE TABLE "agente_config" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "provedor" TEXT NOT NULL DEFAULT 'xai',
    "baseUrl" TEXT NOT NULL DEFAULT 'https://api.x.ai/v1',
    "modelo" TEXT NOT NULL DEFAULT 'grok-4-fast',
    "apiKeyCifrada" TEXT,
    "apiKeyUltimos4" TEXT,
    "systemPrompt" TEXT,
    "temperatura" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "maxTokens" INTEGER NOT NULL DEFAULT 2048,
    "maxIteracoesFerramentas" INTEGER NOT NULL DEFAULT 5,
    "historicoMensagens" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "agente_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_conversas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "titulo" TEXT,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agente_conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_mensagens" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "papel" "AgentePapel" NOT NULL,
    "conteudo" TEXT,
    "ferramenta" TEXT,
    "argumentos" JSONB,
    "resultado" JSONB,
    "pendente" BOOLEAN NOT NULL DEFAULT false,
    "confirmadaEm" TIMESTAMP(3),
    "confirmadaPor" TEXT,
    "tokensEntrada" INTEGER,
    "tokensSaida" INTEGER,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agente_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agente_config_empresaId_key" ON "agente_config"("empresaId");

-- CreateIndex
CREATE INDEX "agente_conversas_empresaId_usuarioId_updatedAt_idx" ON "agente_conversas"("empresaId", "usuarioId", "updatedAt");

-- CreateIndex
CREATE INDEX "agente_mensagens_empresaId_conversaId_criadaEm_idx" ON "agente_mensagens"("empresaId", "conversaId", "criadaEm");

-- AddForeignKey
ALTER TABLE "agente_config" ADD CONSTRAINT "agente_config_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_conversas" ADD CONSTRAINT "agente_conversas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_mensagens" ADD CONSTRAINT "agente_mensagens_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agente_mensagens" ADD CONSTRAINT "agente_mensagens_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "agente_conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "agente_config" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_agente_config ON "agente_config"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

ALTER TABLE "agente_conversas" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_agente_conversas ON "agente_conversas"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

ALTER TABLE "agente_mensagens" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_agente_mensagens ON "agente_mensagens"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- Tela de configuração, em Administração.
INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-menu-agente-config',
  'seed-modulo-administracao',
  'Agente IA',
  'bot',
  '/admin/agente',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-administracao'),
  true, now(), now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-rotina-agente-config', 'seed-menu-agente-config',
  'Agente IA (configuração)', 'agente-config', true, now(), now()
)
ON CONFLICT ("codigo") DO NOTHING;

-- Rotina sem tela própria: controla quem pode CONVERSAR com o agente (o ícone
-- flutuante). Separada de `agente-config`, que é quem pode configurá-lo — são
-- públicos diferentes: todo vendedor usa, só o admin configura.
INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-rotina-agente', 'seed-menu-agente-config',
  'Agente IA (usar)', 'agente', true, now(), now()
)
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  'seed-perm-' || r."codigo" || '-' || p."id" || '-' || a."acao",
  p."id", r."id", a."acao"::"Acao", true, now(), now()
FROM "perfis" p
CROSS JOIN (SELECT unnest(ARRAY['seed-rotina-agente-config','seed-rotina-agente']) AS "id", unnest(ARRAY['agente-config','agente']) AS "codigo") r
CROSS JOIN (
  SELECT unnest(ARRAY['visualizar','cadastrar','editar','excluir','importar','exportar','aprovar','cancelar','bloquear']) AS "acao"
) a
WHERE p."nome" = 'Administrador'
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

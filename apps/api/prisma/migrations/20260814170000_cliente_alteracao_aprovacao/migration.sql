-- Governança do cadastro de cliente: nenhuma origem (tela, enriquecimento por
-- CNPJ, ERP ou agente) altera cliente sem passar por aprovação, e o que muda
-- fica registrado campo a campo.

-- CreateEnum
CREATE TYPE "OrigemAlteracaoCliente" AS ENUM ('manual', 'enriquecimento', 'integracao', 'agente');

-- CreateEnum
CREATE TYPE "StatusAlteracaoCliente" AS ENUM ('pendente', 'aprovada', 'rejeitada');

-- CreateTable
CREATE TABLE "cliente_alteracoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "origem" "OrigemAlteracaoCliente" NOT NULL DEFAULT 'manual',
    "status" "StatusAlteracaoCliente" NOT NULL DEFAULT 'pendente',
    "alteracoes" JSONB NOT NULL,
    "justificativa" TEXT,
    "solicitadoPor" TEXT,
    "solicitadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analisadoPor" TEXT,
    "analisadoEm" TIMESTAMP(3),
    "motivoRecusa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_alteracoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_historico" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "alteracaoId" TEXT,
    "campo" TEXT NOT NULL,
    "valorAnterior" TEXT,
    "valorNovo" TEXT,
    "origem" "OrigemAlteracaoCliente" NOT NULL,
    "autor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_historico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cliente_alteracoes_empresaId_status_idx" ON "cliente_alteracoes"("empresaId", "status");

-- CreateIndex
CREATE INDEX "cliente_alteracoes_empresaId_clienteId_idx" ON "cliente_alteracoes"("empresaId", "clienteId");

-- CreateIndex
CREATE INDEX "cliente_historico_empresaId_clienteId_criadoEm_idx" ON "cliente_historico"("empresaId", "clienteId", "criadoEm");

-- AddForeignKey
ALTER TABLE "cliente_alteracoes" ADD CONSTRAINT "cliente_alteracoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_alteracoes" ADD CONSTRAINT "cliente_alteracoes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_historico" ADD CONSTRAINT "cliente_historico_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_historico" ADD CONSTRAINT "cliente_historico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Uma pendência por cliente **por origem**: é o que impede a fila de encher
-- quando o ERP reenvia o mesmo payload a cada sincronização (o serviço faz
-- upsert sobre esta chave). Índice parcial porque a restrição só vale entre as
-- pendentes — aprovadas e rejeitadas se acumulam livremente.
CREATE UNIQUE INDEX "cliente_alteracoes_pendente_key"
  ON "cliente_alteracoes" ("clienteId", "origem")
  WHERE "status" = 'pendente';

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "cliente_alteracoes" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_cliente_alteracoes ON "cliente_alteracoes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

ALTER TABLE "cliente_historico" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_cliente_historico ON "cliente_historico"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- Menu/rotina da fila de aprovação. Rotina própria (e não reuso de `clientes`)
-- porque aprovar é um papel distinto de editar: quem aprova costuma ser o
-- supervisor, não o vendedor que solicitou.
INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-menu-clientes-alteracoes',
  'seed-modulo-cadastros',
  'Alterações de Cliente',
  'file-clock',
  '/cadastros/clientes-alteracoes',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-cadastros'),
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-rotina-clientes-alteracoes',
  'seed-menu-clientes-alteracoes',
  'Alterações de Cliente',
  'clientes-alteracoes',
  true,
  now(),
  now()
)
ON CONFLICT ("codigo") DO NOTHING;

-- Administrador recebe todas as ações da rotina nova, como nas demais migrations
-- que criam rotina.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  'seed-perm-clientes-alteracoes-' || p."id" || '-' || a."acao",
  p."id",
  'seed-rotina-clientes-alteracoes',
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

-- `clientes.aprovar` é a permissão que decide entre "grava direto" e "entra na
-- fila". O Administrador precisa dela para não ficar preso na própria fila.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  'seed-perm-clientes-aprovar-' || p."id",
  p."id",
  'seed-rotina-clientes',
  'aprovar'::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
WHERE p."nome" = 'Administrador'
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- CreateEnum
CREATE TYPE "NotificacaoTipo" AS ENUM ('whatsapp_mensagem', 'whatsapp_agendamento_erro', 'atividade_vencimento', 'orcamento_aprovado', 'orcamento_recusado', 'cliente_atribuido', 'titulo_vencido');

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "NotificacaoTipo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "rota" TEXT,
    "referenciaId" TEXT,
    "contador" INTEGER NOT NULL DEFAULT 1,
    "ocorridaEm" TIMESTAMP(3) NOT NULL,
    "lidaEm" TIMESTAMP(3),
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificacoes_empresaId_usuarioId_lidaEm_ocorridaEm_idx" ON "notificacoes"("empresaId", "usuarioId", "lidaEm", "ocorridaEm");

-- CreateIndex
CREATE INDEX "notificacoes_empresaId_tipo_referenciaId_idx" ON "notificacoes"("empresaId", "tipo", "referenciaId");

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Uma notificação pendente por (destinatário, tipo, origem).
--
-- Índice PARCIAL, e é o parcial que faz o desenho funcionar: a segunda
-- mensagem da mesma conversa soma no contador da linha que já existe em vez de
-- empilhar uma linha por mensagem; depois de lida, a linha sai do índice e um
-- fato novo na mesma conversa pode criar outra. Sem o `WHERE`, a conversa só
-- notificaria uma vez na vida.
--
-- Prisma não declara índice parcial no schema — ele é criado aqui e o service
-- não usa `upsert` (que exige um unique conhecido pelo client), e sim
-- updateMany + create. Ver NotificacoesService.registrar.
CREATE UNIQUE INDEX "notificacoes_pendente_por_referencia"
  ON "notificacoes" ("empresaId", "usuarioId", "tipo", "referenciaId")
  WHERE "lidaEm" IS NULL AND "referenciaId" IS NOT NULL;

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "notificacoes" ENABLE ROW LEVEL SECURITY;

-- empresaId é texto (uuid gerado pela aplicação via Prisma) — comparação texto-a-texto,
-- sem cast para o tipo uuid do Postgres.
CREATE POLICY tenant_isolation_notificacoes ON "notificacoes"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- Backfill: as conversas que já estão com mensagem não lida.
--
-- Antes desta migration o sino derivava o feed do dado vivo; sem trazer o que
-- já existe, o badge de quem tem conversa pendente zeraria no deploy e a
-- mensagem do cliente sumiria da vista. Vendedor sem usuário vinculado fica de
-- fora — não há a quem notificar.
INSERT INTO "notificacoes" (
  "id", "empresaId", "usuarioId", "tipo", "titulo", "descricao", "rota",
  "referenciaId", "contador", "ocorridaEm", "atualizadaEm"
)
SELECT
  gen_random_uuid(),
  c."empresaId",
  v."usuarioId",
  'whatsapp_mensagem',
  COALESCE(cl."razaoSocial", ct."nomeExibicao", ct."telefoneNormalizado", split_part(ct."jid", '@', 1)),
  NULL, -- a tela monta "N mensagens novas" a partir do contador
  '/comercial/atendimento?conversa=' || c."id",
  c."id",
  c."naoLidas",
  COALESCE(c."ultimaMensagemEm", NOW()),
  NOW()
FROM "whatsapp_conversas" c
JOIN "whatsapp_sessoes" s ON s."id" = c."sessaoId"
JOIN "vendedores" v ON v."id" = s."vendedorId"
JOIN "whatsapp_contatos" ct ON ct."id" = c."contatoId"
LEFT JOIN "clientes" cl ON cl."id" = c."clienteId"
WHERE c."naoLidas" > 0
  AND c."arquivada" = false
  AND v."usuarioId" IS NOT NULL;

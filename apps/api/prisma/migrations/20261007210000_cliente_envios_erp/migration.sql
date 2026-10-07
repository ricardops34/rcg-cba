-- Fila de envio ao ERP das alterações de cliente aprovadas na plataforma.
--
-- Cada alteração aplicada no cadastro (aprovada à mão, autoaprovada pela
-- consulta à Receita ou pelo "Aprovar CNAE vazio") vira um item aqui, com os
-- campos que mudaram. O Protheus lê os pendentes (GET
-- /integracao/clientes/alteracoes), grava na SA1 e confirma (PATCH
-- .../aplicada) — só então o item vira 'enviado'. Sem a confirmação, o item
-- continua pendente e volta no ciclo seguinte: nada deixa de ser enviado.
--
-- O valor não fica aqui: o ERP recebe o valor ATUAL do cadastro na hora da
-- leitura, então duas alterações seguidas do mesmo campo mandam o final.

CREATE TYPE "SituacaoEnvioErp" AS ENUM ('pendente', 'enviado');

CREATE TABLE "cliente_envios_erp" (
  "id"          TEXT NOT NULL,
  "empresaId"   TEXT NOT NULL,
  "clienteId"   TEXT NOT NULL,
  "alteracaoId" TEXT,
  "campos"      TEXT[] NOT NULL,
  "situacao"    "SituacaoEnvioErp" NOT NULL DEFAULT 'pendente',
  "criadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enviadoEm"   TIMESTAMP(3),
  CONSTRAINT "cliente_envios_erp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cliente_envios_erp_empresaId_fkey" FOREIGN KEY ("empresaId")
    REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cliente_envios_erp_clienteId_fkey" FOREIGN KEY ("clienteId")
    REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cliente_envios_erp_alteracaoId_fkey" FOREIGN KEY ("alteracaoId")
    REFERENCES "cliente_alteracoes"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "cliente_envios_erp_empresaId_situacao_criadoEm_idx"
  ON "cliente_envios_erp"("empresaId", "situacao", "criadoEm");
CREATE INDEX "cliente_envios_erp_alteracaoId_idx"
  ON "cliente_envios_erp"("alteracaoId");

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "cliente_envios_erp" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cliente_envios_erp ON "cliente_envios_erp"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- Carga inicial: as alterações aprovadas desde 07/10/2026 (dia em que a
-- consulta à Receita passou a preencher campo vazio direto e a fila foi
-- pedida). Antes disso o retorno não existia e o ERP já pode ter sobrescrito
-- o campo; reenviar o que é velho reverteria a SA1. Os campos saem do
-- histórico aplicado de cada alteração; o que veio do próprio ERP não volta.
INSERT INTO "cliente_envios_erp" ("id", "empresaId", "clienteId", "alteracaoId", "campos", "criadoEm")
SELECT gen_random_uuid()::text, a."empresaId", a."clienteId", a."id",
       ARRAY(SELECT DISTINCT h."campo" FROM "cliente_historico" h
              WHERE h."alteracaoId" = a."id" AND h."status" = 'aplicado'),
       COALESCE(a."analisadoEm", a."solicitadoEm")
  FROM "cliente_alteracoes" a
 WHERE a."status" = 'aprovada'
   AND a."origem" <> 'integracao'
   AND COALESCE(a."analisadoEm", a."solicitadoEm") >= TIMESTAMP '2026-10-07 04:00:00'
   AND EXISTS (SELECT 1 FROM "cliente_historico" h
                WHERE h."alteracaoId" = a."id" AND h."status" = 'aplicado');

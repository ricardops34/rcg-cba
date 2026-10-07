-- Fila de envio ao ERP dos equipamentos de comodato cujos produtos aplicáveis
-- foram incluídos, alterados ou removidos (ou cujo cadastro mudou).
--
-- Um item **pendente por equipamento**: várias mudanças seguidas se juntam
-- num item só, e o Protheus recebe a lista completa e atual de aplicáveis
-- (GET /integracao/equipamentos-comodato/alteracoes). Ele confirma com PATCH
-- .../aplicada informando o `alteradoEm` que leu; se o equipamento mudou
-- depois da leitura, a confirmação é recusada e o item segue pendente — nada
-- deixa de ser enviado.
--
-- Equipamento sem nenhum aplicável não sai para o ERP (decisão do usuário,
-- 2026-10-07): o item fica na fila, fora da leitura, até ganhar um.

CREATE TYPE "SituacaoEnvioComodatoErp" AS ENUM ('pendente', 'enviado');

CREATE TABLE "comodato_envios_erp" (
  "id"         TEXT NOT NULL,
  "empresaId"  TEXT NOT NULL,
  -- O equipamento é um produto (equipamentos_comodato."produtoId").
  "produtoId"  TEXT NOT NULL,
  "situacao"   "SituacaoEnvioComodatoErp" NOT NULL DEFAULT 'pendente',
  "criadoEm"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Última mudança juntada a este item: é a "versão" que o ERP devolve ao
  -- confirmar.
  "alteradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enviadoEm"  TIMESTAMP(3),
  CONSTRAINT "comodato_envios_erp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "comodato_envios_erp_empresaId_fkey" FOREIGN KEY ("empresaId")
    REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "comodato_envios_erp_produtoId_fkey" FOREIGN KEY ("produtoId")
    REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "comodato_envios_erp_empresaId_situacao_alteradoEm_idx"
  ON "comodato_envios_erp"("empresaId", "situacao", "alteradoEm");

-- Um pendente por equipamento (índice parcial — o Prisma não representa).
CREATE UNIQUE INDEX "comodato_envios_erp_um_pendente"
  ON "comodato_envios_erp"("empresaId", "produtoId") WHERE "situacao" = 'pendente';

-- Row-Level Security por empresa (multi-tenant), consistente com as demais tabelas de negócio.
ALTER TABLE "comodato_envios_erp" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_comodato_envios_erp ON "comodato_envios_erp"
  USING ("empresaId" = current_setting('app.current_empresa_id', true));

-- Enfileiramento por trigger, e não no código: os aplicáveis são gravados por
-- vários caminhos (card Relacionados do produto, tela de Equipamentos,
-- "popular" com SQL direto, exclusão em lote) e um caminho novo que
-- esquecesse de enfileirar deixaria de enviar em silêncio. No banco, toda
-- gravação passa. SECURITY DEFINER: grava na fila como dona da tabela,
-- qualquer que seja o contexto de RLS de quem disparou.
CREATE OR REPLACE FUNCTION app_comodato_enfileirar_envio_erp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa TEXT;
  v_produto TEXT;
BEGIN
  IF TG_TABLE_NAME = 'produto_relacionados' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD."tipo" <> 'aplicacao' THEN RETURN OLD; END IF;
      v_empresa := OLD."empresaId";
      v_produto := OLD."produtoId";
    ELSE
      IF NEW."tipo" <> 'aplicacao' THEN RETURN NEW; END IF;
      v_empresa := NEW."empresaId";
      v_produto := NEW."produtoId";
    END IF;
  ELSE
    v_empresa := NEW."empresaId";
    v_produto := NEW."produtoId";
  END IF;

  -- Só equipamento de comodato cadastrado: aplicação de outro produto não é
  -- assunto desta fila.
  IF NOT EXISTS (SELECT 1 FROM "equipamentos_comodato" e WHERE e."produtoId" = v_produto) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO "comodato_envios_erp" ("id", "empresaId", "produtoId")
  VALUES (gen_random_uuid()::text, v_empresa, v_produto)
  ON CONFLICT ("empresaId", "produtoId") WHERE "situacao" = 'pendente'
  DO UPDATE SET "alteradoEm" = CURRENT_TIMESTAMP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER comodato_envio_erp_aplicaveis
  AFTER INSERT OR UPDATE OR DELETE ON "produto_relacionados"
  FOR EACH ROW EXECUTE FUNCTION app_comodato_enfileirar_envio_erp();

CREATE TRIGGER comodato_envio_erp_equipamento
  AFTER INSERT OR UPDATE ON "equipamentos_comodato"
  FOR EACH ROW EXECUTE FUNCTION app_comodato_enfileirar_envio_erp();

-- Carga inicial: todo equipamento que já tem aplicável — o ERP ainda não
-- recebeu nenhum.
INSERT INTO "comodato_envios_erp" ("id", "empresaId", "produtoId")
SELECT gen_random_uuid()::text, e."empresaId", e."produtoId"
  FROM "equipamentos_comodato" e
 WHERE e."deletedAt" IS NULL
   AND EXISTS (SELECT 1 FROM "produto_relacionados" r
                WHERE r."produtoId" = e."produtoId" AND r."tipo" = 'aplicacao');

-- Um cliente pode ter vários contatos de WhatsApp, cada um identificado pela
-- finalidade comercial. A tabela já possui RLS; esta migration apenas amplia
-- suas colunas e preserva a policy tenant_isolation_whatsapp_contatos.
CREATE TYPE "WhatsappTipoContato" AS ENUM (
  'geral',
  'financeiro',
  'compras',
  'contabilidade_fiscal',
  'outros'
);

ALTER TABLE "whatsapp_contatos"
  ADD COLUMN "tipo" "WhatsappTipoContato" NOT NULL DEFAULT 'geral',
  ADD COLUMN "email" TEXT;

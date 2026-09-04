-- WhatsApp institucional com triagem por IA.
--
-- Até aqui todo número era de um vendedor: `whatsapp_sessoes.vendedorId` era
-- NOT NULL e havia um `UNIQUE (empresaId, vendedorId)`. A empresa passa a ter
-- também um número próprio — a porta de entrada, atendida pela IA antes de
-- chegar a alguém. Os dois convivem: quem já fala com o vendedor dele continua.

CREATE TYPE "WhatsappSessaoTipo" AS ENUM ('vendedor', 'empresa');
CREATE TYPE "WhatsappAtendimentoStatus" AS ENUM ('bot', 'aguardando', 'humano', 'encerrada');

ALTER TABLE "whatsapp_sessoes"
  ADD COLUMN "tipo" "WhatsappSessaoTipo" NOT NULL DEFAULT 'vendedor';

ALTER TABLE "whatsapp_sessoes" ALTER COLUMN "vendedorId" DROP NOT NULL;

-- O UNIQUE antigo continua valendo para as sessões de vendedor. Ele **não**
-- serve à institucional: no Postgres vários NULL não colidem, então nada
-- impediria duas sessões de empresa. Daí o índice parcial abaixo, que é a
-- regra "uma sessão institucional por empresa" escrita onde ela se sustenta.
CREATE UNIQUE INDEX "whatsapp_sessoes_empresa_institucional_key"
  ON "whatsapp_sessoes"("empresaId")
  WHERE "tipo" = 'empresa';

-- Estado do atendimento, só usado pela conversa do número institucional.
--
-- O default é `humano`, e não `bot`: toda conversa que já existe é de aparelho
-- de vendedor, e já pertence a ele. Nascer em `bot` faria a triagem "assumir"
-- retroativamente conversas em andamento.
ALTER TABLE "whatsapp_conversas"
  ADD COLUMN "atendimento" "WhatsappAtendimentoStatus" NOT NULL DEFAULT 'humano',
  ADD COLUMN "atendenteVendedorId" TEXT,
  ADD COLUMN "assunto" TEXT,
  ADD COLUMN "direcionadaEm" TIMESTAMP(3);

ALTER TABLE "whatsapp_conversas"
  ADD CONSTRAINT "whatsapp_conversas_atendenteVendedorId_fkey"
  FOREIGN KEY ("atendenteVendedorId") REFERENCES "vendedores"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- A consulta que a tela de Atendimento faz: "o que está comigo, e o que a IA
-- me direcionou e ainda não abri".
CREATE INDEX "whatsapp_conversas_atendimento_idx"
  ON "whatsapp_conversas"("empresaId", "atendenteVendedorId", "atendimento");

-- Configuração da triagem, por empresa.
ALTER TABLE "whatsapp_config"
  ADD COLUMN "atendimentoIaAtivo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "atendimentoSaudacao" TEXT,
  ADD COLUMN "atendimentoInformacoes" TEXT,
  ADD COLUMN "atendimentoInatividadeMin" INTEGER NOT NULL DEFAULT 30;

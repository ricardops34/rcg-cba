-- Contatos do SA1 (A1_CTTIP/CTNOM/CTNUM/CTWAT/CTEML 01 a 04) como campos planos do cliente,
-- e o cadastro de contatos preparado para recebê-los (e-mail opcional, tipo, WhatsApp, origem).
ALTER TABLE "clientes"
  ADD COLUMN "contato1Tipo" TEXT,
  ADD COLUMN "contato1Nome" TEXT,
  ADD COLUMN "contato1Telefone" TEXT,
  ADD COLUMN "contato1Whatsapp" BOOLEAN,
  ADD COLUMN "contato1Email" TEXT,
  ADD COLUMN "contato2Tipo" TEXT,
  ADD COLUMN "contato2Nome" TEXT,
  ADD COLUMN "contato2Telefone" TEXT,
  ADD COLUMN "contato2Whatsapp" BOOLEAN,
  ADD COLUMN "contato2Email" TEXT,
  ADD COLUMN "contato3Tipo" TEXT,
  ADD COLUMN "contato3Nome" TEXT,
  ADD COLUMN "contato3Telefone" TEXT,
  ADD COLUMN "contato3Whatsapp" BOOLEAN,
  ADD COLUMN "contato3Email" TEXT,
  ADD COLUMN "contato4Tipo" TEXT,
  ADD COLUMN "contato4Nome" TEXT,
  ADD COLUMN "contato4Telefone" TEXT,
  ADD COLUMN "contato4Whatsapp" BOOLEAN,
  ADD COLUMN "contato4Email" TEXT;

ALTER TABLE "cliente_contatos"
  ALTER COLUMN "email" DROP NOT NULL,
  ADD COLUMN "tipo" TEXT,
  ADD COLUMN "whatsapp" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "origem" TEXT NOT NULL DEFAULT 'plataforma',
  ADD COLUMN "posicaoErp" INTEGER;

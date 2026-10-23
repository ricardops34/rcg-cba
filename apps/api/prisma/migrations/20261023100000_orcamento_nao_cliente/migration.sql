-- Orçamento para quem ainda não é cliente: o cliente passa a ser opcional e os
-- dados do interessado ficam no próprio orçamento. A tabela já tem RLS.
ALTER TABLE "orcamentos" ALTER COLUMN "clienteId" DROP NOT NULL;
ALTER TABLE "orcamentos" ADD COLUMN "prospectNome" TEXT;
ALTER TABLE "orcamentos" ADD COLUMN "prospectDocumento" TEXT;
ALTER TABLE "orcamentos" ADD COLUMN "prospectTelefone" TEXT;
ALTER TABLE "orcamentos" ADD COLUMN "prospectEmail" TEXT;
ALTER TABLE "orcamentos" ADD COLUMN "prospectMunicipio" TEXT;
ALTER TABLE "orcamentos" ADD COLUMN "prospectUf" TEXT;

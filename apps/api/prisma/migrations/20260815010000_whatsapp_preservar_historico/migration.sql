-- O histórico de conversa com o cliente é da empresa, não do aparelho do
-- vendedor. Com ON DELETE CASCADE, apagar uma sessão (vendedor desligado,
-- troca de celular, limpeza) levaria junto todas as conversas e mensagens —
-- em silêncio, num DELETE que ninguém associaria a perder atendimento.
--
-- RESTRICT força a decisão a ser explícita: para remover a sessão é preciso
-- antes tratar o que está pendurado nela.

-- DropForeignKey
ALTER TABLE "whatsapp_conversas" DROP CONSTRAINT "whatsapp_conversas_sessaoId_fkey";

-- DropForeignKey
ALTER TABLE "whatsapp_conversas" DROP CONSTRAINT "whatsapp_conversas_contatoId_fkey";

-- AddForeignKey
ALTER TABLE "whatsapp_conversas" ADD CONSTRAINT "whatsapp_conversas_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "whatsapp_sessoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversas" ADD CONSTRAINT "whatsapp_conversas_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "whatsapp_contatos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cópia local da foto de perfil obtida do WhatsApp. A tabela já possui RLS;
-- esta migration apenas acrescenta uma coluna à estrutura protegida.
ALTER TABLE "whatsapp_contatos" ADD COLUMN "fotoUrl" TEXT;

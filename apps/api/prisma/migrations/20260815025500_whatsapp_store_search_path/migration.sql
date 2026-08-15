-- O `?schema=` da URL é convenção do Prisma; o driver `pg` (que a biblioteca
-- do WhatsApp usa) não o interpreta, e sem search_path o CREATE TABLE falha com
-- "no schema has been selected to create in".
--
-- Definir no role em vez de na aplicação: assim vale para qualquer conexão
-- desse role, inclusive um psql de investigação, e não depende de o worker
-- lembrar de configurar.
ALTER ROLE whatsapp_store SET search_path = whatsapp;

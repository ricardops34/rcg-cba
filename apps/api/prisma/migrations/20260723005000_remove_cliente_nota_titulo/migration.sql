-- Remove por completo os módulos de Clientes, Notas Fiscais de Saída e
-- Títulos a Receber (tabelas, RLS policies e FKs são derrubadas junto com
-- as tabelas).
DROP TABLE "notas_saida_itens";
DROP TABLE "notas_saida";
DROP TABLE "titulos_receber";
DROP TABLE "clientes";

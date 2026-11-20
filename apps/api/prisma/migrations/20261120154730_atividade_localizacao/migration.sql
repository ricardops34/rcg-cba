-- Localização do dispositivo nos eventos do orçamento (criação, alteração,
-- decisão do cliente, pedido/liberação/recusa de desconto). Decisão do usuário
-- em 2026-11-20 (docs/planos/2026-11-20-mapas-clientes-rotas.md): não é
-- obrigatória; sem ela, `localizacaoMotivo` diz por quê. Colunas novas em tabela
-- que já tem RLS: as policies de `atividades` continuam valendo.
ALTER TABLE "atividades" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "atividades" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "atividades" ADD COLUMN "localizacaoPrecisao" DOUBLE PRECISION;
ALTER TABLE "atividades" ADD COLUMN "localizacaoMotivo" TEXT;

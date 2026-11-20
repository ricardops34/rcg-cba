-- Coordenadas da empresa: ponto de referência nos mapas (aba Mapa do cliente,
-- rotas de visita). Decisão do usuário em 2026-11-20
-- (docs/planos/2026-11-20-mapas-clientes-rotas.md). Nascem nulas; preenchidas em
-- Administração > Geolocalização. Coluna nova em tabela que já tem RLS: as
-- policies de `empresas` continuam valendo, nada a criar.
ALTER TABLE "empresas" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "empresas" ADD COLUMN "longitude" DOUBLE PRECISION;

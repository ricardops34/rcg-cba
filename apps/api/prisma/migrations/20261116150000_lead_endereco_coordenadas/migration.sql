-- Endereço e coordenadas do lead (decisão do usuário, 16/11/2026): os leads do
-- vendedor aparecem no mapa da Posição de Cliente, e as coordenadas vêm do
-- Google ao salvar o endereço, como no cadastro de clientes
-- (docs/planos/geocodificacao-clientes.md). Colunas novas, sem RLS nova: a
-- tabela já tem a policy por empresa.
ALTER TABLE "leads"
  ADD COLUMN "endereco" TEXT,
  ADD COLUMN "bairro" TEXT,
  ADD COLUMN "municipio" TEXT,
  ADD COLUMN "uf" TEXT,
  ADD COLUMN "cep" TEXT,
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "coordenadasConsultadasEm" TIMESTAMP(3);

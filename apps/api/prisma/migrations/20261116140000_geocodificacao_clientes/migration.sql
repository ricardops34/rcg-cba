-- Coordenadas do cliente pela Geocoding API do Google (decisão do usuário,
-- 16/11/2026; docs/planos/geocodificacao-clientes.md). Busca automática ao
-- salvar o cliente e lote na tela Administração > Geolocalização; o resultado
-- volta ao ERP (A1_XLAT/A1_XLNG) pela fila de alterações.

-- Origem própria na fila: o histórico do cliente mostra que a coordenada veio
-- do lote do Google, não de alguém na tela.
ALTER TYPE "OrigemAlteracaoCliente" ADD VALUE IF NOT EXISTS 'geocodificacao';

ALTER TABLE "clientes" ADD COLUMN "coordenadasConsultadasEm" TIMESTAMP(3);

-- Menu e rotina com os mesmos ids do `catalogo-sistema.ts` (a ordem de deploy
-- é `migrate deploy` e só depois `sincronizar-catalogo`); modelo:
-- 20261001100100_perm_sms.
INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-geolocalizacao',
  'seed-modulo-administracao',
  'Geolocalização',
  'map-pin',
  '/admin/geolocalizacao',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-administracao'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-administracao')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-geolocalizacao',
  'seed-menu-geolocalizacao',
  'Geolocalização',
  'geolocalizacao',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-geolocalizacao')
ON CONFLICT ("codigo") DO NOTHING;

-- Critério `sistemaBase` (ver "Migration que concede permissão" no README).
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  p."id",
  r."id",
  a."acao"::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN "rotinas" r
CROSS JOIN (
  VALUES ('visualizar'), ('cadastrar'), ('editar'), ('excluir'),
         ('importar'), ('exportar'), ('aprovar'), ('cancelar'), ('bloquear')
) AS a("acao")
WHERE r."codigo" = 'geolocalizacao'
  AND p."sistemaBase" = true
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- Parâmetros da empresa (editados juntos pela tela, como os do SMS). Nasce
-- desligado: a chave é do cliente da plataforma, e cada consulta é cobrada.
INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), e."id", p."parametro", p."tipo"::"TipoParametro",
       p."tamanho", p."conteudo", p."descricao", true, now(), now()
FROM "empresas" e
CROSS JOIN (
  VALUES
    ('GEO_ATIVO', 'booleano', NULL::integer, 'false', 'Habilita a busca das coordenadas do cliente pela Geocoding API do Google'),
    ('GEO_URL', 'texto', 300, 'https://maps.googleapis.com/maps/api/geocode/json', 'URL da Geocoding API do Google'),
    ('GEO_CHAVE', 'senha', 200, NULL, 'Chave da API do Google (Google Cloud > APIs e serviços > Credenciais), com a Geocoding API liberada'),
    ('GEO_AO_SALVAR', 'booleano', NULL, 'true', 'Busca as coordenadas ao salvar o cliente quando o endereço muda ou elas estão vazias'),
    ('GEO_LOTE_LIMITE', 'numero', 5, '200', 'Máximo de clientes consultados por execução do lote de coordenadas')
) AS p("parametro", "tipo", "tamanho", "conteudo", "descricao")
WHERE e."deletedAt" IS NULL
ON CONFLICT ("empresaId", "parametro") DO NOTHING;

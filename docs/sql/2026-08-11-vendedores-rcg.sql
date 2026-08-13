-- Atualização do cadastro de Vendedores da RCG Distribuidora a partir da SA3
-- do ERP (A3_COD, A3_NOME, A3_NREDUZ, A3_EMAIL, A3_DDDTEL, A3_TEL, A3_COMIS).
--
-- Como rodar (role dona do banco, `plataforma` — ver docs/runbook-operacao.md):
--   psql "$DATABASE_URL" -f 2026-08-11-vendedores-rcg.sql
--
-- Idempotente: casa por (empresaId, codigoErp), a chave natural do vendedor —
-- atualiza quem já existe e cadastra quem não existe (na base de dev, só o
-- 000037 não existia). A listagem do fim mostra como os 14 ficaram.
--
-- O script NÃO mexe em `ativo`/`desligado`: reativar vendedor é decisão de
-- cadastro, não de sincronização. Há um bloco comentado no fim para isso.
--
-- Telefone gravado como "(DDD) NÚMERO", o mesmo formato que o import do
-- legado usa (prisma/import-legado.ts). percComissao é o A3_COMIS, a base do
-- cálculo de comissão do orçamento.

BEGIN;

-- Os mesmos 14 registros servem ao UPDATE e ao INSERT; a tabela temporária
-- evita repetir a lista duas vezes e sair delas divergentes.
CREATE TEMP TABLE vendedores_sa3(
  "codigoErp"    text,
  nome           text,
  "nomeReduzido" text,
  email          text,
  ddd            text,
  telefone       text,
  "percComissao" double precision
) ON COMMIT DROP;

INSERT INTO vendedores_sa3 VALUES
    ('000069', 'ESCRITORIO',                             'ESCRITORIO',        'pedidos@rcgdist.com.br',         '67', '33827328',  10.0),
    ('000020', 'BORGES & CAMARGO REPRES. COM. LTDA ME',  'JOSUE',             'jbl_mergulhador@yahho.com.br',   '67', '98318949',  10.0),
    ('000045', 'RUBENS DE MORAES',                       'RUBENS',            'rubens.moraes@rcgdist.com.br',   '67', '92571896',   4.0),
    ('000315', 'ALEXANDER MARCO DA SILVA VELASQUEZ',     'ALEX',              'alex@rcgdist.com.br',            '67', '92663710',   4.0),
    ('000021', 'LUCAS MALDONADO DA SILVA',               'LUCAS MALDONADO',   'lucas@rcgdist.com.br',           '67', '999559929',  3.0),
    ('000319', 'LUCAS GONCALVES PEREIRA VARGAS',         'LUCAS VARGAS',      'lucasvargas@rcgdist.com.br',     '67', '998285573',  2.0),
    ('000310', 'TEMP REGIAO 001 INTERNO',                'REGIAO 001 INTERNO','julia@rcgdist.com.br',           '67', '981501600',  2.0),
    ('000026', 'GLEDSON PAULINO LEAL',                   'GLEDSON',           'gledson@rcgdist.com.br',         '67', '984086196',  3.0),
    ('000029', 'ANIKY',                                  'ANIKY',             'pedido@rcgdist.com.br',          '67', '999999999', 10.0),
    ('000070', 'OFF REPRESENTACAO LTDA',                 'ORCIDNEY',          'offrepresentacao@outlook.com',   '67', '992530826', 10.0),
    ('000320', 'CARLOS ALGUSTO PAGLIARINI PEDRO JUNIOR', 'CARLOS',            'carlospagliarini07@hotmail.com', '67', '996534784', 10.0),
    ('000034', 'ANA CRISTINA GOMES ALEXANDRES',          'ANA',               'ana@rcgdist.com.br',             '67', '679999999',  2.0),
    ('000036', 'CAROLINE DA SILVA DE JESUS',             'CAROLINE',          'caroline@rcgdist.com.br',        '67', '999107514',  2.0),
    ('000037', 'JOAO GABRIEL NISHIDA TAMAOKI',           'JOAO',              'joao@rcgdist.com.br',            '67', '999312467',  2.0);

UPDATE vendedores v
SET
  nome           = d.nome,
  "nomeReduzido" = d."nomeReduzido",
  email          = d.email,
  telefone       = '(' || d.ddd || ') ' || d.telefone,
  "percComissao" = d."percComissao",
  "updatedAt"    = now()
FROM vendedores_sa3 d, empresas e
WHERE e.alias = 'rcg'
  AND v."empresaId" = e.id
  AND v."codigoErp" = d."codigoErp"
  AND v."deletedAt" IS NULL;

-- Códigos que ainda não existem na base entram como vendedor ativo. `id` é
-- uuid gerado no banco: o Prisma gera o dele na aplicação, e a coluna não tem
-- default próprio.
INSERT INTO vendedores (
  id, "empresaId", "codigoErp", nome, "nomeReduzido", email, telefone,
  "percComissao", vendedor, supervisor, gerente, ativo, desligado,
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), e.id, d."codigoErp", d.nome, d."nomeReduzido", d.email,
  '(' || d.ddd || ') ' || d.telefone, d."percComissao",
  true, false, false, true, false, now(), now()
FROM vendedores_sa3 d
CROSS JOIN empresas e
WHERE e.alias = 'rcg'
  AND NOT EXISTS (
    SELECT 1 FROM vendedores v
    WHERE v."empresaId" = e.id AND v."codigoErp" = d."codigoErp"
  );

COMMIT;

-- Conferência: os 14 códigos e como ficaram. Código que não existir na base
-- aparece com as colunas do vendedor em branco.
-- Reativação, se a lista do ERP for a dos vendedores em atividade. Fora do
-- bloco acima de propósito: na base de dev, o 000319 (LUCAS VARGAS) está
-- inativo, e vendedor inativo não aparece nos selects do sistema (orçamento,
-- filtros). Descomente só se for para reativá-los.
--
-- UPDATE vendedores v
-- SET ativo = true, desligado = false, "updatedAt" = now()
-- FROM vendedores_sa3 d, empresas e
-- WHERE e.alias = 'rcg' AND v."empresaId" = e.id
--   AND v."codigoErp" = d."codigoErp" AND v."deletedAt" IS NULL;

WITH empresa AS (
  SELECT id FROM empresas WHERE alias = 'rcg'
),
codigos("codigoErp") AS (
  VALUES ('000069'),('000020'),('000045'),('000315'),('000021'),('000319'),('000310'),
         ('000026'),('000029'),('000070'),('000320'),('000034'),('000036'),('000037')
)
SELECT
  c."codigoErp",
  v.nome,
  v."nomeReduzido",
  v.email,
  v.telefone,
  v."percComissao",
  v.ativo
FROM codigos c
LEFT JOIN empresa e ON true
LEFT JOIN vendedores v
  ON v."empresaId" = e.id AND v."codigoErp" = c."codigoErp" AND v."deletedAt" IS NULL
ORDER BY c."codigoErp";

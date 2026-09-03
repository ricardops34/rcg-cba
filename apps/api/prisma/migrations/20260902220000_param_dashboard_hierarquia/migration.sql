-- Parâmetro que liga o agrupamento por hierarquia no Dashboard Gerencial.
--
-- A tela lista um vendedor por linha. Com este parâmetro ligado, as linhas
-- passam a vir agrupadas pela hierarquia comercial — cada supervisor com os
-- vendedores dele, cada gerente com os supervisores —, e cada grupo mostra o
-- subtotal. Desligado, volta a lista plana de sempre.
--
-- Nasce **ligado**: a empresa que cadastrou hierarquia (supervisorId /
-- gerenteId nos vendedores) quer vê-la; quem não cadastrou não percebe
-- diferença, porque sem vínculo não há grupo a formar.
--
-- Vai para todas as empresas que existem, e o `seed-base.ts` o cria nas novas
-- (as duas listas precisam andar juntas — ver o cabeçalho do seed).

INSERT INTO "parametros_empresa" (
  "id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao",
  "ativo", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  e."id",
  'DASHBOARD_GERENCIAL_HIERARQUIA',
  'booleano'::"TipoParametro",
  NULL,
  'true',
  'Agrupa o Dashboard Gerencial pela hierarquia comercial (gerente, supervisor e seus vendedores); falso mostra a lista plana',
  true,
  now(),
  now()
FROM "empresas" e
WHERE e."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "parametros_empresa" p
    WHERE p."empresaId" = e."id"
      AND p."parametro" = 'DASHBOARD_GERENCIAL_HIERARQUIA'
  );

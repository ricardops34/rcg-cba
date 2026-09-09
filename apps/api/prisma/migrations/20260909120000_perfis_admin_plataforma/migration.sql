-- Separa "Administrador" em dois perfis — Administrador da Plataforma e
-- Administrador Empresa — e cria o perfil Administrativo.
--
-- Até aqui a autoridade sobre a plataforma (PlatformAdminGuard, área
-- /plataforma) morava num atributo do usuário, `administradorPlataforma`,
-- separado da lista de perfis: quem olhava a tela de Perfis não via esse
-- poder. Mesmo defeito de duas fontes de verdade que a migration
-- 20260903180000_saas_admin já corrigiu para `ativo`/`situacao` — a saída é a
-- mesma, um campo só. Aqui o campo passa a ser `perfis.administraPlataforma`
-- (ver o comentário da coluna em schema.prisma), e o vínculo usuário×empresa
-- escolhido para cada admin existente passa a usar o novo perfil.
--
-- ADMINISTRATIVO_PERMISSOES e a criação dos perfis no seed
-- (seed-base.ts/bootstrapPerfis) precisam andar juntas com este arquivo: o
-- seed apaga e recria a base do zero, então uma base nova nasce correta só
-- pelo seed; esta migration é o caminho da base que já existe.
--
-- ORDEM IMPORTA — o passo 6 (DROP COLUMN) é irreversível. Rode esta migration
-- inteira de uma vez só depois de validar o backfill do passo 5 (ver
-- README de operação / docs/planos, seção de verificação desta mudança).

-- 1) Nova coluna. Começa false para todo mundo; os passos 3/4 ligam nos dois
-- perfis novos.
ALTER TABLE "perfis" ADD COLUMN "administraPlataforma" BOOLEAN NOT NULL DEFAULT false;

-- 2) O perfil "Administrador" existente vira "Administrador Empresa" — ele
-- continua sendo o admin de dentro do tenant, só muda de nome. Guardado por
-- `@@unique([nome])`: se por algum motivo já existir um perfil chamado
-- "Administrador Empresa" (não deveria, mas o UPDATE falharia silenciosamente
-- de outra forma), o WHERE restringe ao que tem o nome antigo.
UPDATE "perfis"
SET "nome" = 'Administrador Empresa', "updatedAt" = now()
WHERE "nome" = 'Administrador' AND "deletedAt" IS NULL;

-- 3) Administrador da Plataforma: mesmas permissões totais que o
-- Administrador Empresa tinha, mais administraPlataforma = true. Só é criado
-- se ainda não existir (idempotente — permite rodar a migration mais de uma
-- vez num ambiente que já tenha sido corrigido manualmente).
INSERT INTO "perfis" ("id", "nome", "descricao", "sistemaBase", "administraPlataforma", "ativo", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  'Administrador da Plataforma',
  'Acesso total ao sistema e à administração da plataforma (todas as empresas)',
  true,
  true,
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "perfis" WHERE "nome" = 'Administrador da Plataforma' AND "deletedAt" IS NULL
);

INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  p."id",
  r."id",
  a."acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN "rotinas" r
CROSS JOIN unnest(enum_range(NULL::"Acao")) AS a("acao")
WHERE p."nome" = 'Administrador da Plataforma'
  AND p."deletedAt" IS NULL
  AND r."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- 4) Administrativo: retaguarda comercial (cadastros, financeiro, consultas
-- gerenciais, aprovação de alterações de cliente), sem administração do
-- sistema e sem carteira própria. Mesma lista de ADMINISTRATIVO_PERMISSOES em
-- catalogo-sistema.ts — as duas precisam ser mantidas iguais.
INSERT INTO "perfis" ("id", "nome", "descricao", "sistemaBase", "administraPlataforma", "ativo", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  'Administrativo',
  'Cadastros, financeiro e consultas gerenciais, sem administração do sistema',
  false,
  false,
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "perfis" WHERE "nome" = 'Administrativo' AND "deletedAt" IS NULL
);

INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  p."id",
  r."id",
  x."acao"::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN "rotinas" r
CROSS JOIN (VALUES
  ('clientes', 'visualizar'), ('clientes', 'cadastrar'), ('clientes', 'editar'), ('clientes', 'aprovar'),
  ('clientes-alteracoes', 'visualizar'),
  ('produtos', 'visualizar'), ('produtos', 'cadastrar'), ('produtos', 'editar'),
  ('tabelas-preco', 'visualizar'), ('tabelas-preco', 'cadastrar'), ('tabelas-preco', 'editar'),
  ('condicoes-pagamento', 'visualizar'), ('condicoes-pagamento', 'cadastrar'), ('condicoes-pagamento', 'editar'),
  ('contas-bancarias', 'visualizar'), ('contas-bancarias', 'cadastrar'), ('contas-bancarias', 'editar'),
  ('categorias', 'visualizar'), ('categorias', 'cadastrar'), ('categorias', 'editar'),
  ('armazens', 'visualizar'), ('armazens', 'cadastrar'), ('armazens', 'editar'),
  ('regras-desconto', 'visualizar'), ('regras-desconto', 'cadastrar'), ('regras-desconto', 'editar'),
  ('fornecedores', 'visualizar'),
  ('notas-entrada', 'visualizar'),
  ('notas-saida', 'visualizar'),
  ('titulos-receber', 'visualizar'),
  ('dashboard-comercial', 'visualizar'),
  ('consulta-vendas-cliente', 'visualizar'),
  ('consulta-vendas-produto', 'visualizar'),
  ('consulta-vendas-categoria', 'visualizar'),
  ('consulta-vendas-vendedor', 'visualizar'),
  ('consulta-evolucao', 'visualizar'),
  ('sugestao-compra', 'visualizar')
) AS x("codigo", "acao")
WHERE p."nome" = 'Administrativo'
  AND p."deletedAt" IS NULL
  AND r."codigo" = x."codigo"
  AND r."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- 5) Backfill: cada usuário que hoje é administrador da plataforma (via
-- Usuario.administradorPlataforma) recebe o perfil novo no vínculo ATIVO mais
-- antigo que tiver — mesmo desempate que AuthService.findVinculoAtivo usa
-- (orderBy createdAt asc), para que o vínculo escolhido seja estável e
-- previsível. Um usuário com mais de um vínculo mantém os outros com o perfil
-- que já tinham (normalmente Administrador Empresa, pelo rename do passo 2).
WITH alvo AS (
  SELECT DISTINCT ON (ue."usuarioId") ue."id"
  FROM "usuario_empresas" ue
  JOIN "usuarios" u ON u."id" = ue."usuarioId"
  WHERE u."administradorPlataforma" = true
    AND u."deletedAt" IS NULL
    AND ue."ativo" = true
    AND ue."deletedAt" IS NULL
  ORDER BY ue."usuarioId", ue."createdAt" ASC
)
UPDATE "usuario_empresas"
SET "perfilId" = (SELECT "id" FROM "perfis" WHERE "nome" = 'Administrador da Plataforma' AND "deletedAt" IS NULL),
    "updatedAt" = now()
WHERE "id" IN (SELECT "id" FROM alvo);

-- Aviso operacional (não falha a migration): usuário marcado como admin da
-- plataforma sem nenhum vínculo ativo para receber o perfil novo. Fica sem
-- acesso à área /plataforma até ganhar um vínculo manualmente — não há como a
-- migration inventar uma empresa para ele.
DO $$
DECLARE
  sem_vinculo INTEGER;
BEGIN
  SELECT count(*) INTO sem_vinculo
  FROM "usuarios" u
  WHERE u."administradorPlataforma" = true
    AND u."deletedAt" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "usuario_empresas" ue
      WHERE ue."usuarioId" = u."id" AND ue."ativo" = true AND ue."deletedAt" IS NULL
    );
  IF sem_vinculo > 0 THEN
    RAISE NOTICE '% administrador(es) da plataforma sem vínculo ativo — não recebeu o perfil novo, precisa de vínculo manual', sem_vinculo;
  END IF;
END $$;

-- 6) Remove o atributo antigo. Irreversível — é o passo que exige ter
-- validado o backfill acima antes de aplicar em produção.
ALTER TABLE "usuarios" DROP COLUMN "administradorPlataforma";

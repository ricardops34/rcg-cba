-- Política de senha: de tabela singleton **global** para parâmetro **por
-- empresa**. Decisão do usuário em 2026-08-26.
--
-- O que muda de regra, e não só de lugar: até aqui existia uma política para o
-- sistema inteiro. Agora cada empresa tem a sua, e para um usuário que pertence
-- a mais de uma vale a combinação **mais restritiva** das políticas dele — a
-- conta é uma só, e aceitar a regra mais fraca enfraqueceria o acesso à empresa
-- mais exigente pela porta da outra. Quem resolve isso é o
-- `PoliticaSenhaService`; aqui só se move o dado.
--
-- Some também a tela própria (`/admin/politica-senha`) e a rotina: a edição
-- passa a ser em Administração > Parâmetros, como já acontece com a validade do
-- orçamento. É a mesma direção do enxugamento da migration anterior.
--
-- **Zero significa "sem limite"** em tamanho máximo, expiração e histórico. A
-- coluna aceitava NULL; a tela de Parâmetros não tem campo vazio, só número.
-- Por isso o COALESCE abaixo — sem ele, NULL viraria string vazia e o parâmetro
-- cairia no padrão do código em vez de preservar o que a empresa tinha.
--
-- A ordem importa e é a razão de tudo estar numa migration só: os valores são
-- **copiados antes** do DROP, e migration roda em transação — se a cópia
-- falhar, a tabela não é apagada.

-- 1. Uma linha por parâmetro, por empresa, com o valor que a política global
--    tinha. `ON CONFLICT DO NOTHING` para o caso de a chave já existir.
INSERT INTO "parametros_empresa"
  ("id", "empresaId", "parametro", "tipo", "tamanho", "conteudo", "descricao", "ativo", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  e."id",
  p."parametro",
  p."tipo"::"TipoParametro",
  p."tamanho",
  p."conteudo",
  p."descricao",
  true,
  NOW(),
  NOW()
FROM "empresas" e
CROSS JOIN LATERAL (
  SELECT * FROM (
    SELECT
      ps."tamanhoMinimo"::text            AS min,
      COALESCE(ps."tamanhoMaximo", 0)::text     AS max,
      ps."exigirMaiuscula"::text          AS maiuscula,
      ps."exigirMinuscula"::text          AS minuscula,
      ps."exigirNumero"::text             AS numero,
      ps."exigirEspecial"::text           AS especial,
      COALESCE(ps."diasParaExpirar", 0)::text   AS expirar,
      ps."historicoQuantidade"::text      AS historico,
      ps."tentativasAntesBloqueio"::text  AS tentativas,
      ps."minutosBloqueio"::text          AS bloqueio
    FROM "politica_senha" ps
    WHERE ps."id" = 'singleton'
    -- Base que nunca gravou a política: valem os mesmos defaults do código.
    UNION ALL
    SELECT '8', '0', 'true', 'false', 'true', 'false', '0', '0', '5', '15'
    WHERE NOT EXISTS (SELECT 1 FROM "politica_senha" WHERE "id" = 'singleton')
  ) origem
  CROSS JOIN LATERAL (VALUES
    ('SENHA_TAMANHO_MINIMO', 'numero', 2, origem.min,
     'Mínimo de caracteres da senha'),
    ('SENHA_TAMANHO_MAXIMO', 'numero', 3, origem.max,
     'Máximo de caracteres da senha; 0 = sem limite'),
    ('SENHA_EXIGIR_MAIUSCULA', 'booleano', NULL, origem.maiuscula,
     'Exige ao menos uma letra maiúscula na senha'),
    ('SENHA_EXIGIR_MINUSCULA', 'booleano', NULL, origem.minuscula,
     'Exige ao menos uma letra minúscula na senha'),
    ('SENHA_EXIGIR_NUMERO', 'booleano', NULL, origem.numero,
     'Exige ao menos um número na senha'),
    ('SENHA_EXIGIR_ESPECIAL', 'booleano', NULL, origem.especial,
     'Exige ao menos um caractere especial na senha'),
    ('SENHA_DIAS_PARA_EXPIRAR', 'numero', 4, origem.expirar,
     'Dias até a senha expirar e exigir troca; 0 = nunca expira'),
    ('SENHA_HISTORICO_QUANTIDADE', 'numero', 2, origem.historico,
     'Quantas senhas anteriores não podem ser reutilizadas; 0 = não valida'),
    ('SENHA_TENTATIVAS_ANTES_BLOQUEIO', 'numero', 2, origem.tentativas,
     'Tentativas de login sem sucesso antes de bloquear a conta'),
    ('SENHA_MINUTOS_BLOQUEIO', 'numero', 4, origem.bloqueio,
     'Minutos que a conta fica bloqueada após exceder as tentativas')
  ) AS p("parametro", "tipo", "tamanho", "conteudo", "descricao")
) p
WHERE e."deletedAt" IS NULL
ON CONFLICT ("empresaId", "parametro") DO NOTHING;

-- 2. A tela e a rotina saem de cena.
DELETE FROM "perfil_permissoes"
WHERE "rotinaId" IN (SELECT "id" FROM "rotinas" WHERE "codigo" = 'politica-senha');

DELETE FROM "rotinas" WHERE "codigo" = 'politica-senha';
DELETE FROM "menus" WHERE "id" = 'seed-menu-politica-senha';

-- 3. A tabela some. O histórico de senhas (`senha_historico`) **não** é
--    afetado: é outra tabela, sem FK para esta, e continua sendo consultada
--    conforme o parâmetro SENHA_HISTORICO_QUANTIDADE.
DROP TABLE "politica_senha";

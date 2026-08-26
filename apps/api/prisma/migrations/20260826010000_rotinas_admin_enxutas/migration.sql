-- Enxuga as rotinas do módulo Administração e fecha um vazamento de permissão
-- do perfil Diretor. Três coisas independentes, na mesma migration porque as
-- três mexem no mesmo par de tabelas (`rotinas`, `perfil_permissoes`).
--
-- `menus`, `rotinas` e `perfil_permissoes` são tabelas de sistema, sem
-- `empresaId` e sem RLS (ver prisma/migrations/README.md). O seed também foi
-- atualizado, para a base criada do zero.

-- ---------------------------------------------------------------------------
-- 1. "Validade de Orçamento" deixa de ser tela própria.
--
-- O valor já mora em Parâmetros (`ORCAMENTO_DIAS_VALIDADE`): o
-- `OrcamentoConfigService` só lê de lá, e a tela de Administração continuava no
-- ar apontando para um `PATCH /orcamento-config` que **não existe** — o
-- controller expõe apenas `@Get()`. Ou seja: salvar ali dava 404 desde que o
-- valor migrou. Some a tela, o menu e a rotina; o GET fica, porque é o
-- formulário de Orçamento que o consome (o vendedor não acessa Parâmetros).
--
-- A tabela `orcamento_config` **permanece**: ela guarda o contador
-- `ultimoNumero` da numeração de orçamento, que não tem nada a ver com isto.
-- ---------------------------------------------------------------------------
DELETE FROM "perfil_permissoes"
WHERE "rotinaId" IN (SELECT "id" FROM "rotinas" WHERE "codigo" = 'orcamento-config');

DELETE FROM "rotinas" WHERE "codigo" = 'orcamento-config';
DELETE FROM "menus" WHERE "id" = 'seed-menu-orcamento-config';

-- ---------------------------------------------------------------------------
-- 2. `modulos` + `menus` + `rotinas` viram `estrutura`.
--
-- Três rotinas para um único controller (`estrutura.controller.ts`) e uma única
-- tela (`/admin/estrutura`) — três linhas na tela de Perfis, vezes nove ações,
-- para uma decisão só. O controller passou a exigir `estrutura.*`.
--
-- Quem tinha **qualquer** das três ganha a equivalente na nova: nenhum acesso é
-- criado nem perdido na troca.
-- ---------------------------------------------------------------------------
INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-rotina-estrutura', 'seed-menu-estrutura', 'Estrutura de Menu',
  'estrutura', true, NOW(), NOW()
)
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT DISTINCT
  gen_random_uuid()::text,
  pp."perfilId",
  (SELECT "id" FROM "rotinas" WHERE "codigo" = 'estrutura'),
  pp."acao",
  true,
  NOW(),
  NOW()
FROM "perfil_permissoes" pp
JOIN "rotinas" r ON r."id" = pp."rotinaId"
WHERE r."codigo" IN ('modulos', 'menus', 'rotinas')
  AND pp."permitido" = true
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

DELETE FROM "perfil_permissoes"
WHERE "rotinaId" IN (SELECT "id" FROM "rotinas" WHERE "codigo" IN ('modulos', 'menus', 'rotinas'));

DELETE FROM "rotinas" WHERE "codigo" IN ('modulos', 'menus', 'rotinas');

-- ---------------------------------------------------------------------------
-- 3. O Diretor perde o que é administração do sistema.
--
-- O perfil Diretor é "acesso irrestrito ao dado comercial, sem administração
-- do sistema", e o seed montava isso a partir de uma lista de códigos escrita à
-- mão. O problema não era o conteúdo da lista, era a direção dela: toda rotina
-- de Administração criada depois nascia **liberada** ao Diretor até alguém
-- lembrar de acrescentá-la. Quatro já haviam escapado — `agente-config`
-- (a tela que guarda a chave da API de IA e a conta conectada), `whatsapp-config`,
-- `contas-bancarias` e `comunicados`; as três últimas só não aparecem em bases
-- antigas porque nasceram depois do perfil.
--
-- O seed passou a deduzir pelo módulo do menu. Aqui o mesmo critério é aplicado
-- ao que já está gravado.
--
-- Duas exceções, e as duas são deliberadas:
--   `agente`         -> fica. Não é administrar o assistente, é usá-lo; mora
--                       sob aquele menu só por dividi-lo com `agente-config`.
--   `whatsapp-equipe` -> sai, embora seja de menu comercial. Sem cadastro de
--                       vendedor, `resolverEscopoVendedores` devolve "sem
--                       restrição": a permissão que dá "a equipe" a um
--                       supervisor daria a **empresa inteira** ao Diretor.
-- ---------------------------------------------------------------------------
DELETE FROM "perfil_permissoes" pp
USING "perfis" p, "rotinas" r, "menus" m
WHERE pp."perfilId" = p."id"
  AND pp."rotinaId" = r."id"
  AND r."menuId" = m."id"
  AND p."nome" = 'Diretor'
  AND m."moduloId" = 'seed-modulo-administracao'
  AND r."codigo" <> 'agente';

DELETE FROM "perfil_permissoes" pp
USING "perfis" p, "rotinas" r
WHERE pp."perfilId" = p."id"
  AND pp."rotinaId" = r."id"
  AND p."nome" = 'Diretor'
  AND r."codigo" = 'whatsapp-equipe';

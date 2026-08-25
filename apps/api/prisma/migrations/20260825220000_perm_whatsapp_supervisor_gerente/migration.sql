-- Atendimento por WhatsApp para Supervisor e Gerente.
--
-- Até aqui só o perfil Vendedor tinha `whatsapp-conversas`: supervisor e
-- gerente não abriam nem a **própria** tela de Atendimento, embora tenham
-- cadastro em `vendedores` e carteira própria. E `whatsapp-equipe` não estava
-- em perfil nenhum além do Administrador, então a leitura do atendimento da
-- equipe — que o código já suporta — não chegava a acontecer.
--
-- As duas rotinas são separadas de propósito (ver seed-base.ts):
--
--   whatsapp-conversas  -> as **minhas** conversas
--   whatsapp-equipe     -> ler a conversa **de outro vendedor**
--
-- A regra do negócio, confirmada pelo usuário: gerente e supervisor veem a
-- conversa alheia **somente para monitorar**. É leitura pura — a API já barra
-- responder, reagir, agendar, vincular contato a cliente, e desde esta rodada
-- também marcar como lida (o que zerava o contador do vendedor e mandava o
-- visto azul ao cliente pelo aparelho dele). Por isso `whatsapp-equipe` recebe
-- só `visualizar`: as outras ações não existiriam nem que fossem concedidas.
--
-- O perfil **Vendedor não entra** em `whatsapp-equipe` — é o atendimento dos
-- colegas. O **Diretor** também fica fora, e não por esquecimento: ele não tem
-- cadastro de vendedor, e `resolverEscopoVendedores` devolve "sem restrição"
-- para quem não tem vínculo, então a permissão abriria a empresa inteira em vez
-- de uma equipe.
--
-- Por que numa migration e não no seed: `seed-base.ts` **apaga todos os dados
-- de negócio** antes de repovoar — rodá-lo numa base com dados importados seria
-- destruir a base. O seed também foi atualizado, para a base criada do zero.
--
-- `menus`, `rotinas` e `perfil_permissoes` são tabelas de sistema, sem
-- `empresaId` e sem RLS (ver prisma/migrations/README.md).

-- O menu e as rotinas do WhatsApp nasceram só no seed, nunca numa migration:
-- numa base que jamais rodou o seed elas não existem, e sem elas os INSERTs de
-- permissão abaixo não encontrariam a rotina e não fariam nada — silenciosamente.
INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
VALUES (
  'seed-menu-whatsapp', 'seed-modulo-comercial', 'Atendimento',
  'message-circle', '/comercial/atendimento', 12, true, NOW(), NOW()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
VALUES
  ('seed-rotina-whatsapp-conversas', 'seed-menu-whatsapp', 'Atendimento',
   'whatsapp-conversas', true, NOW(), NOW()),
  ('seed-rotina-whatsapp-equipe', 'seed-menu-whatsapp', 'WhatsApp da equipe',
   'whatsapp-equipe', true, NOW(), NOW())
ON CONFLICT ("codigo") DO NOTHING;

-- 1. As próprias conversas — as mesmas três ações do Vendedor, porque
--    supervisor e gerente também atendem a carteira deles:
--      visualizar -> ver as próprias conversas
--      cadastrar  -> enviar mensagem
--      editar     -> conectar/desconectar o aparelho e vincular contato a cliente
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text, p."id", r."id", a."acao"::"Acao", true, NOW(), NOW()
FROM "perfis" p
CROSS JOIN "rotinas" r
CROSS JOIN (VALUES ('visualizar'), ('cadastrar'), ('editar')) AS a("acao")
WHERE p."nome" IN ('Supervisor', 'Gerente')
  AND p."deletedAt" IS NULL
  AND r."codigo" = 'whatsapp-conversas'
  AND r."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

-- 2. A conversa da equipe — só leitura, e só para estes dois perfis.
INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text, p."id", r."id", 'visualizar'::"Acao", true, NOW(), NOW()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE p."nome" IN ('Supervisor', 'Gerente')
  AND p."deletedAt" IS NULL
  AND r."codigo" = 'whatsapp-equipe'
  AND r."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

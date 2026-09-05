-- Rotina "Recado para a equipe": recado pelo WhatsApp da empresa para quem
-- trabalha nela (docs/planos/whatsapp-institucional-funcionarios.md, Fatia 4).
--
-- Mesmo desenho de `20260902120000_perm_meus_atendimentos`: a migration cria
-- menu e rotina além de conceder, porque a ordem de deploy é `migrate deploy` e
-- só depois `sincronizar-catalogo` — uma migration que só concedesse não
-- encontraria a rotina e sairia sem fazer nada, deixando a tela invisível até
-- alguém marcá-la à mão em Perfis. Os ids e o código são os mesmos do catálogo,
-- e os dois lados são idempotentes.
--
-- O `WHERE EXISTS` não é zelo: numa base criada do zero, `modulos` ainda está
-- vazia quando isto roda, e o INSERT morreria na chave estrangeira levando o
-- deploy junto. Base nova recebe tudo pelo `seed-base.ts`.

INSERT INTO "menus" ("id", "moduloId", "nome", "icone", "rota", "ordem", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-menu-recados',
  'seed-modulo-comercial',
  'Recado para a equipe',
  'send',
  '/comercial/recados',
  (SELECT COALESCE(MAX("ordem"), 0) + 1 FROM "menus" WHERE "moduloId" = 'seed-modulo-comercial'),
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "modulos" WHERE "id" = 'seed-modulo-comercial')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "rotinas" ("id", "menuId", "nome", "codigo", "ativo", "createdAt", "updatedAt")
SELECT
  'seed-rotina-whatsapp-recados',
  'seed-menu-recados',
  'Recado para a equipe',
  'whatsapp-recados',
  true,
  now(),
  now()
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'seed-menu-recados')
ON CONFLICT ("codigo") DO NOTHING;

-- **Vendedor fica de fora, de propósito.** O alcance do recado é a hierarquia
-- abaixo de quem envia (`resolverEscopoVendedores`), então quem não tem
-- ninguém abaixo só conseguiria mandar recado para si mesmo — a tela existiria
-- sem servir para nada. Quem administra pode conceder na tela de Perfis se
-- quiser outro arranjo.
--
-- Diretor entra: ele não tem cadastro de vendedor, logo o escopo devolve "sem
-- restrição" e ele alcança a empresa inteira — que é o papel dele.
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
CROSS JOIN (VALUES ('visualizar'), ('cadastrar')) AS a("acao")
WHERE r."codigo" = 'whatsapp-recados'
  AND p."nome" IN ('Administrador', 'Diretor', 'Gerente', 'Supervisor')
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

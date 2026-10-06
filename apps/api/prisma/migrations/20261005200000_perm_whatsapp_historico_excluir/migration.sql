-- Conceder `whatsapp-historico.excluir` aos perfis administradores.
--
-- O histórico de WhatsApp é permanente; a exceção é o administrador da
-- empresa, que precisa poder excluir uma conversa, o histórico de uma
-- instância ou a instância com o histórico (decisão de 2026-10-05). A ação
-- `excluir` da rotina `whatsapp-historico` é essa permissão: separada de
-- `whatsapp-config.editar`, para quem só configura o WhatsApp não ganhar o
-- poder de apagar histórico.
--
-- Critério `sistemaBase`, não o nome do perfil — ver "Migration que concede
-- permissão" em prisma/migrations/README.md. Ninguém tinha esta ação antes.
-- Os demais perfis (Diretor, Gerente…) ficam de fora de propósito; conceder a
-- eles é decisão do cliente, na tela de Perfis.

INSERT INTO "perfil_permissoes" ("id", "perfilId", "rotinaId", "acao", "permitido", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  p."id",
  r."id",
  'excluir'::"Acao",
  true,
  now(),
  now()
FROM "perfis" p
CROSS JOIN "rotinas" r
WHERE r."codigo" = 'whatsapp-historico'
  AND p."sistemaBase" = true
  AND p."deletedAt" IS NULL
ON CONFLICT ("perfilId", "rotinaId", "acao") DO NOTHING;

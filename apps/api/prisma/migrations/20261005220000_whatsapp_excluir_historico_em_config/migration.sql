-- Apagar histórico de WhatsApp passa a exigir `whatsapp-config.excluir`.
--
-- A 20261005200000_perm_whatsapp_historico_excluir pôs a permissão em
-- `whatsapp-historico.excluir`, a rotina do Gerencial. O usuário pediu a
-- exclusão só em Administração → WhatsApp → Instâncias (decisão de
-- 2026-10-05), e `whatsapp-config.excluir` é a ação dessa tela — separada de
-- `editar`, e que só os perfis administradores têm. Não há o que conceder.
--
-- Aqui só se desfaz a concessão anterior, que deixou de ter uso. Onde a rotina
-- `whatsapp-historico` não existe (a produção), não há o que apagar.

DELETE FROM "perfil_permissoes" pp
USING "rotinas" r
WHERE pp."rotinaId" = r."id"
  AND r."codigo" = 'whatsapp-historico'
  AND pp."acao" = 'excluir'::"Acao";

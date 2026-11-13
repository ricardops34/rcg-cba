-- Fecha as pendências da Agenda que já tinham sido resolvidas por outro
-- caminho e continuavam "atrasadas" (e no resumo diário do assistente).
--
-- Até aqui só autorizar/recusar desconto fechava a tarefa; aprovar ou recusar
-- uma alteração de cadastro, alterar o orçamento (que derruba o pedido), a
-- recusa/aprovação do cliente e a exclusão não fechavam. O código agora fecha
-- em todos esses caminhos; isto limpa o que ficou para trás. Só dados,
-- idempotente.

-- Alteração de cadastro: a tarefa só guarda o cliente. Fecha quando o cliente
-- não tem mais nenhuma solicitação pendente.
UPDATE "atividades" a
SET "concluida" = true,
    "dataConclusao" = now(),
    "updatedAt" = now()
WHERE a."concluida" = false
  AND a."deletedAt" IS NULL
  AND a."titulo" LIKE 'Alteração de cadastro aguardando aprovação%'
  AND NOT EXISTS (
    SELECT 1 FROM "cliente_alteracoes" ca
    WHERE ca."empresaId" = a."empresaId"
      AND ca."clienteId" = a."clienteId"
      AND ca."status" = 'pendente'
  );

-- Autorização de desconto: fecha quando o orçamento não está mais aguardando
-- liberação — já autorizado, pedido derrubado/recusado, decidido pelo cliente
-- ou excluído.
UPDATE "atividades" a
SET "concluida" = true,
    "dataConclusao" = now(),
    "updatedAt" = now()
FROM "orcamentos" o
WHERE o."id" = a."orcamentoId"
  AND a."concluida" = false
  AND a."deletedAt" IS NULL
  AND a."titulo" LIKE 'Autorização de desconto solicitada%'
  AND (
    o."descontoSolicitadoEm" IS NULL
    OR o."descontoAutorizadoEm" IS NOT NULL
    OR o."status" NOT IN ('rascunho', 'enviado')
    OR o."deletedAt" IS NOT NULL
  );

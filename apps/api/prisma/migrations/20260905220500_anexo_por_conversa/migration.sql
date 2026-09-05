-- O anexo do assistente passa a viver na **conversa**, não num turno só.
--
-- Sem isto o fluxo natural quebrava, e foi visto com um PDF real em
-- 2026-09-05: o modelo lê a ficha, pergunta "confirma que é este produto?" e,
-- na resposta seguinte, já não tem o arquivo — respondeu "não tenho acesso ao
-- conteúdo do PDF nesta conversa". O `conversaId` é gravado no primeiro envio
-- e o anexo continua valendo até ser consumido.
--
-- Sem chave estrangeira para `agente_conversas` de propósito: o anexo pode
-- nascer antes de a conversa existir (a conversa é criada no primeiro envio), e
-- apagar a conversa não deve derrubar o arquivo que ainda não virou ficha.

ALTER TABLE "agente_anexos" ADD COLUMN "conversaId" TEXT;

CREATE INDEX "agente_anexos_empresaId_conversaId_consumidoEm_idx"
  ON "agente_anexos"("empresaId", "conversaId", "consumidoEm");

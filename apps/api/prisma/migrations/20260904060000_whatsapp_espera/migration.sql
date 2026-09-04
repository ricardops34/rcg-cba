-- Tempo de espera do atendimento institucional, e o aviso de quem está na fila.
--
-- Os dois marcos que faltavam para medir. `direcionadaEm` já dizia quando a IA
-- entregou; sozinho ele não fecha nenhum intervalo — é preciso saber quando
-- alguém pegou, e quando o número virou um cliente identificado.

ALTER TABLE "whatsapp_conversas"
  ADD COLUMN "assumidaEm" TIMESTAMP(3),
  ADD COLUMN "clienteVinculadoEm" TIMESTAMP(3);

-- Conversa que já está com uma pessoa antes desta migration tem o marco de
-- assunção desconhecido, não "agora": preencher com now() inventaria espera
-- zero para atendimento que pode ter demorado horas. Fica nulo, e o indicador
-- ignora quem não tem os dois marcos — ver o comentário do campo.

-- A consulta dos indicadores: as que estão esperando, mais antiga primeiro.
CREATE INDEX "whatsapp_conversas_espera_idx"
  ON "whatsapp_conversas"("empresaId", "atendimento", "direcionadaEm");

-- Aviso de cliente aguardando atendimento.
ALTER TYPE "NotificacaoTipo" ADD VALUE 'whatsapp_aguardando';

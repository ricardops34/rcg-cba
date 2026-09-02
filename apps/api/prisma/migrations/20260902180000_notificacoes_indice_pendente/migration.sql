-- Índice único parcial que o `ON CONFLICT` de `registrarNotificacao` arbitra.
--
-- **Ele não existia.** O código o cita pelo nome
-- (`notificacoes_pendente_por_referencia`) e repete o predicado dele no
-- `WHERE` do upsert, mas nem o `schema.prisma` nem a baseline o criam — o
-- Prisma não sabe declarar índice parcial, então ele só pode vir de migration,
-- e se perdeu na consolidação de 2026-08-28.
--
-- O efeito era grave e silencioso em log: **toda** notificação com
-- `referenciaId` falhava com `42P10` (there is no unique or exclusion
-- constraint matching the ON CONFLICT specification). Como
-- `registrarNotificacao` roda dentro da transação que grava a mensagem de
-- WhatsApp recebida, o erro derrubava a transação inteira — a mensagem do
-- cliente não era gravada, e o sino nunca acumulava. Apareceu ao popular a
-- base de demonstração (2026-09-02): com a base vazia não havia o que
-- notificar, e nada estourava.
--
-- O predicado é exatamente o do `WHERE` da query: só notificação **pendente**
-- (não lida) e **com referência** participa do índice. É o que permite duas
-- notificações do mesmo tipo para a mesma conversa quando a primeira já foi
-- lida — a nova é um fato novo, não a repetição do anterior.

-- Duplicatas anteriores impediriam a criação do índice único. Elas só existem
-- porque o upsert nunca funcionou; a mais recente é a que vale (é a que o
-- upsert teria atualizado), e as demais viram lidas em vez de apagadas, para
-- não sumir com histórico que alguém pode estar vendo.
UPDATE "notificacoes" n
SET "lidaEm" = NOW()
WHERE n."lidaEm" IS NULL
  AND n."referenciaId" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "notificacoes" mais_nova
    WHERE mais_nova."empresaId" = n."empresaId"
      AND mais_nova."usuarioId" = n."usuarioId"
      AND mais_nova."tipo" = n."tipo"
      AND mais_nova."referenciaId" = n."referenciaId"
      AND mais_nova."lidaEm" IS NULL
      AND (
        mais_nova."ocorridaEm" > n."ocorridaEm"
        OR (mais_nova."ocorridaEm" = n."ocorridaEm" AND mais_nova."id" > n."id")
      )
  );

CREATE UNIQUE INDEX "notificacoes_pendente_por_referencia"
  ON "notificacoes" ("empresaId", "usuarioId", "tipo", "referenciaId")
  WHERE "lidaEm" IS NULL AND "referenciaId" IS NOT NULL;

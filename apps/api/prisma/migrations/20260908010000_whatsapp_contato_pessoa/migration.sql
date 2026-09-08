-- Unifica a pessoa: quem conversa no WhatsApp passa a ser um contato do
-- cadastro do cliente (`cliente_contatos`), e não mais um nome/e-mail digitado
-- solto em `whatsapp_contatos`.
--
-- `whatsapp_contatos` continua existindo como **o número** — ele precisa
-- guardar jid, foto e conversa de quem ainda não é cliente nenhum. O que muda é
-- que, quando a pessoa está no cadastro, o número aponta para ela.
--
-- A coluna é anulável de propósito: número sem vínculo, grupo e contato de quem
-- não é cliente continuam válidos.

ALTER TABLE "whatsapp_contatos" ADD COLUMN "clienteContatoId" TEXT;

ALTER TABLE "whatsapp_contatos"
  ADD CONSTRAINT "whatsapp_contatos_clienteContatoId_fkey"
  FOREIGN KEY ("clienteContatoId") REFERENCES "cliente_contatos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "whatsapp_contatos_empresaId_clienteContatoId_idx"
  ON "whatsapp_contatos"("empresaId", "clienteContatoId");

-- Backfill do que já está vinculado a um cliente: casa o número do WhatsApp
-- (`5567…`) com o celular ou o telefone do contato (`67…`), ambos reduzidos a
-- dígitos. Só grava quando o número casa com **um** contato — dois candidatos é
-- ambiguidade que ninguém aqui pode resolver sem perguntar, e um vínculo errado
-- é pior do que nenhum. Diferença de nono dígito também fica de fora: o vínculo
-- continua sendo feito na tela, que é onde alguém confere.
WITH candidatos AS (
  SELECT
    w."id"  AS numero_id,
    cc."id" AS contato_id,
    count(*) OVER (PARTITION BY w."id") AS quantos
  FROM "whatsapp_contatos" w
  JOIN "cliente_contatos" cc
    ON cc."empresaId" = w."empresaId"
   AND cc."clienteId" = w."clienteId"
   AND cc."ativo"
   AND (
        '55' || regexp_replace(cc."celular",  '\D', '', 'g') = w."telefoneNormalizado"
     OR '55' || regexp_replace(cc."telefone", '\D', '', 'g') = w."telefoneNormalizado"
   )
  WHERE w."clienteId" IS NOT NULL
    AND w."telefoneNormalizado" IS NOT NULL
)
UPDATE "whatsapp_contatos" w
SET "clienteContatoId" = c.contato_id
FROM candidatos c
WHERE c.numero_id = w."id"
  AND c.quantos = 1;

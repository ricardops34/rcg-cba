-- Correção de segurança: o pareamento do funcionário estava chaveado pelos
-- **últimos 8 dígitos** do telefone.
--
-- Consequência real, não hipotética: um número de outro DDD com os mesmos 8
-- dígitos finais — (67) 99869-9444 e (11) 99869-9444 — caía no mesmo vínculo.
-- Depois que o vendedor legítimo confirmasse o código, o outro número herdava a
-- confirmação e entrava como funcionário, com a carteira dele.
--
-- O DDD é o que separa os dois, e estava fora da chave. `chave` passa a ser
-- DDD + 8 dígitos (sem DDI, sem o 9º dígito), que identifica o aparelho de
-- forma exata sem quebrar quando o WhatsApp entrega o número em formatos
-- diferentes. O `sufixo` continua existindo para **encontrar** a pessoa no
-- cadastro, onde a tolerância é desejável: achar um candidato não autoriza
-- nada, só abre um pedido de código.

-- Todo pareamento existente é descartado, e não convertido.
--
-- Converter manteria confirmações que podem ter sido concedidas ao número
-- errado — exatamente o que esta migration corrige. A tabela nasceu ontem
-- (20260904220000) e o custo é uma reconfirmação por pessoa: ela escreve para o
-- número da empresa e digita o código de novo.
DELETE FROM "whatsapp_vinculos_funcionario";

DROP INDEX IF EXISTS "whatsapp_vinculos_funcionario_empresaId_sufixo_key";

ALTER TABLE "whatsapp_vinculos_funcionario" ADD COLUMN "chave" TEXT NOT NULL;

CREATE UNIQUE INDEX "whatsapp_vinculos_funcionario_empresaId_chave_key"
  ON "whatsapp_vinculos_funcionario" ("empresaId", "chave");

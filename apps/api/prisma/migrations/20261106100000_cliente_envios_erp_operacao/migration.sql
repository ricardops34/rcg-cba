-- Cliente criado na plataforma passa a ir ao ERP: o item da fila de envio ganha a
-- operação. 'incluir' = cliente novo (o ERP devolve chave e codigoErp no PATCH
-- .../aplicada); 'alterar' = o que já existia (todos os itens atuais).
-- A tabela já tem RLS e policy (20261007210000_cliente_envios_erp); coluna nova não
-- precisa de policy.

CREATE TYPE "OperacaoEnvioErp" AS ENUM ('incluir', 'alterar');

ALTER TABLE "cliente_envios_erp"
  ADD COLUMN "operacao" "OperacaoEnvioErp" NOT NULL DEFAULT 'alterar';

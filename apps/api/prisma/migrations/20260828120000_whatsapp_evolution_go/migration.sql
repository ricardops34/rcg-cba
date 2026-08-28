-- Evolution GO como segundo transporte do Atendimento por WhatsApp.
--
-- Decisão do usuário em 2026-08-27: a empresa escolhe **um** transporte de cada
-- vez (`whatsapp_config.transporte`), mas cada sessão continua guardando com
-- qual provedor ela foi conectada — é o que impede que trocar o padrão da
-- empresa faça a API falar Evolution com uma instância que ainda vive no zapo.
--
-- Nenhuma policy nova: `whatsapp_config` e `whatsapp_sessoes` já têm RLS por
-- empresa, e isto são apenas colunas delas.

-- 1. O novo valor do enum.
--
-- `IF NOT EXISTS` porque `ALTER TYPE ... ADD VALUE` não é transacional em
-- versões antigas do Postgres e uma migration reexecutada não pode falhar aqui.
ALTER TYPE "WhatsappTransporte" ADD VALUE IF NOT EXISTS 'evolution_go';

-- 2. Configuração da empresa.
--
-- A chave administrativa vai cifrada (AES-256-GCM, o mesmo tratamento da chave
-- do agente de IA): quem a tem cria, conecta e apaga instância de qualquer
-- vendedor. Nenhuma rota de leitura a devolve.
ALTER TABLE "whatsapp_config"
  ADD COLUMN "evolutionUrl" TEXT,
  ADD COLUMN "evolutionApiKeyCifrada" TEXT,
  ADD COLUMN "evolutionVersao" TEXT;

-- 3. Instância por sessão.
--
-- `instanciaExterna` é o nome técnico determinístico usado na criação;
-- `instanciaId` é o identificador devolvido pelo serviço. Os dois existem
-- porque as rotas da Evolution GO divergem entre versões sobre qual aceitam.
--
-- Os dois segredos são separados de propósito: `instanciaTokenCifrado`
-- autentica a API falando com a Evolution, `webhookSegredoCifrado` autentica o
-- caminho contrário. Vazar um não entrega o outro, e o do webhook pode ser
-- trocado sem exigir novo pareamento.
ALTER TABLE "whatsapp_sessoes"
  ADD COLUMN "instanciaExterna" TEXT,
  ADD COLUMN "instanciaId" TEXT,
  ADD COLUMN "instanciaTokenCifrado" TEXT,
  ADD COLUMN "webhookSegredoCifrado" TEXT;

-- O webhook da Evolution GO chega sem tenant no contexto e traz a instância,
-- não a sessão. A busca é sempre por empresa + instância; sem este índice ela
-- vira varredura da tabela a cada mensagem recebida.
CREATE INDEX "whatsapp_sessoes_empresaId_instanciaExterna_idx"
  ON "whatsapp_sessoes" ("empresaId", "instanciaExterna");

-- `advancedSettings` da Evolution GO: de constante no código para configuração
-- da empresa.
--
-- Eram fixos no corpo do `POST /instance/create`, então só valiam para
-- instância nova e não havia como rever a decisão depois. A Evolution GO expõe
-- `GET`/`PUT /instance/{instanceId}/advanced-settings` (conferido no Swagger do
-- serviço em 2026-09-21), então alterar depois de criada é possível.
--
-- Os defaults reproduzem **exatamente** o que estava fixo no código, então
-- aplicar esta migration não muda o comportamento de nenhuma instância já
-- conectada: quem não abrir a tela continua com grupos e status ignorados e
-- sem visto azul automático.
ALTER TABLE "whatsapp_config"
  ADD COLUMN IF NOT EXISTS "evolutionAlwaysOnline"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "evolutionIgnoreGroups"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "evolutionIgnoreStatus"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "evolutionReadMessages"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "evolutionRejectCall"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "evolutionMsgRejectCall" TEXT;

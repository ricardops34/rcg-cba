-- Versão de prompt do sistema que a empresa segue.
--
-- Quando uma atualização melhora o texto de uma ferramenta, quem já tinha
-- reescrito o dela não recebe a melhoria, e quem não reescreveu recebe uma
-- mudança de comportamento que não pediu. Com versões, a atualização **oferece**
-- o texto novo em vez de impor.
--
-- Nulo = acompanha a mais recente, que é o que a maioria espera de uma
-- atualização. Escolher trava numa versão.
ALTER TABLE "agente_ferramentas" ADD COLUMN "versaoPrompt" TEXT;

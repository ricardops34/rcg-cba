-- "Atendimento" (a tela de conversas do WhatsApp) passa a se chamar "Conversas".
--
-- Motivo: "Meus Atendimentos" entrou no mesmo módulo Comercial e os dois nomes
-- competiam — um é o canal onde se atende, o outro é o registro do que já foi
-- atendido. Decisão do usuário em 2026-09-02.
--
-- A **rota não muda**: as notificações do sino já gravadas apontam para
-- `/comercial/atendimento?conversa=...`, e trocá-la quebraria o link de toda
-- notificação antiga.
--
-- O menu o `sincronizar-catalogo` também atualizaria (ele mantém nome/rota/
-- ícone em dia); a **rotina** não — o script cria e não renomeia, de propósito.
-- Por isso os dois UPDATEs aqui: é o nome da rotina que a tela de Perfis mostra.

UPDATE "menus"
SET "nome" = 'Conversas', "updatedAt" = now()
WHERE "id" = 'seed-menu-whatsapp' AND "nome" = 'Atendimento';

UPDATE "rotinas"
SET "nome" = 'Conversas', "updatedAt" = now()
WHERE "codigo" = 'whatsapp-conversas' AND "nome" = 'Atendimento';

-- Toda rotina que pertence ao módulo Administração é exclusiva dos perfis
-- base (Administrador Empresa e Administrador da Plataforma).
--
-- "Usar Agente IA" não é configuração administrativa. A rotina sem tela é
-- movida para o Dashboard Comercial antes da limpeza para preservar o acesso
-- dos perfis comerciais; "Agente IA (configurar)" continua em Administração.

UPDATE "rotinas"
SET "menuId" = 'seed-menu-dashboard-comercial', "updatedAt" = now()
WHERE "codigo" = 'agente';

DELETE FROM "perfil_permissoes" pp
USING "perfis" p, "rotinas" r, "menus" m
WHERE pp."perfilId" = p."id"
  AND pp."rotinaId" = r."id"
  AND r."menuId" = m."id"
  AND m."moduloId" = 'seed-modulo-administracao'
  AND p."sistemaBase" = false;

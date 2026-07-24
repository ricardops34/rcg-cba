-- Usuários técnicos referenciados como DEFINER pelas views do dump legado.
-- São contas locais, bloqueadas para login, usadas apenas para preservar os
-- metadados e permitir que a restauração finalize sem erro 1449.
CREATE USER IF NOT EXISTS 'rcgdistc_portal'@'localhost' ACCOUNT LOCK;
CREATE USER IF NOT EXISTS 'rcgdistc'@'localhost' ACCOUNT LOCK;

GRANT SELECT, SHOW VIEW ON `rcgdistc_portal`.* TO 'rcgdistc_portal'@'localhost';
GRANT SELECT, SHOW VIEW ON `rcgdistc_portal`.* TO 'rcgdistc'@'localhost';

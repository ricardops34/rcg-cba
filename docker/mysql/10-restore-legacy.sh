#!/bin/sh
set -eu

# O dump histórico contém referências órfãs em tabelas que não participam dos
# importadores atuais. O MySQL valida dados preexistentes ao adicionar as FKs e
# interromperia toda a restauração. Desabilitar a checagem nesta mesma sessão
# preserva o espelho legado completo sem alterar o arquivo original.
{
  printf '%s\n' 'SET FOREIGN_KEY_CHECKS=0;'
  cat /legacy/rcgdistc_portal.sql
  printf '%s\n' 'SET FOREIGN_KEY_CHECKS=1;'
} | mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}"

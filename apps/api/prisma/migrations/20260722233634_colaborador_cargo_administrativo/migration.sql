-- Adiciona o nível "administrativo" ao enum Cargo: perfil de acesso sem
-- restrição de carteira (vê toda a empresa), diferente dos demais níveis
-- (diretor/gerente/supervisor/vendedor), cujo escopo de dados segue a árvore
-- de supervisão (colaboradores.superiorId) — ver equipeColaboradorIds.
ALTER TYPE "Cargo" ADD VALUE 'administrativo';

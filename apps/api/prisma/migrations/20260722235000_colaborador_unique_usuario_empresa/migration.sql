-- Um usuário pode ter acesso a mais de uma empresa (multiempresa). A unicidade
-- de "usuarioId" era global (um colaborador por usuário no sistema inteiro),
-- o que impedia um mesmo usuário ter um colaborador em cada empresa vinculada.
-- Passa a ser única por (usuarioId, empresaId).
DROP INDEX "colaboradores_usuarioId_key";
CREATE UNIQUE INDEX "colaboradores_usuarioId_empresaId_key" ON "colaboradores"("usuarioId", "empresaId");

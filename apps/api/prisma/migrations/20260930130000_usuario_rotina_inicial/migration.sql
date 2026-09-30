-- Rotina inicial escolhida pelo próprio usuário, por vínculo com a empresa.
--
-- Antes a tela inicial só vinha do perfil (perfis.rotinaInicialId), e perfil é
-- global: o administrador da empresa não consegue alterá-lo. Agora cada
-- usuário escolhe, entre as rotinas que ele enxerga, a tela que abre ao
-- entrar. Nulo = segue a rotina inicial do perfil.
--
-- Fica no vínculo, não em "usuarios", porque o acesso às rotinas muda de uma
-- empresa para outra. usuario_empresas já tem RLS (tenant + self); coluna nova
-- não pede policy nova.

ALTER TABLE "usuario_empresas" ADD COLUMN "rotinaInicialId" TEXT;

ALTER TABLE "usuario_empresas"
  ADD CONSTRAINT "usuario_empresas_rotinaInicialId_fkey"
  FOREIGN KEY ("rotinaInicialId") REFERENCES "rotinas"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

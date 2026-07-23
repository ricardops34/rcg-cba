-- Elimina o model Colaborador: seus campos passam a viver em UsuarioEmpresa
-- (todo UsuarioEmpresa já tinha exatamente um Colaborador correspondente —
-- mesma unique constraint (usuarioId, empresaId) nas duas tabelas). Ver
-- docs/regras-de-negocio.md.

-- 1) Novas colunas em usuario_empresas.
ALTER TABLE "usuario_empresas"
  ADD COLUMN "cargo" "Cargo",
  ADD COLUMN "superiorId" TEXT,
  ADD COLUMN "codigoErp" TEXT,
  ADD COLUMN "nomeReduzido" TEXT,
  ADD COLUMN "telefone" TEXT,
  ADD COLUMN "celular" TEXT,
  ADD COLUMN "dataNascimento" TIMESTAMP(3);

-- 2) Copia os campos escalares de colaboradores (casando por usuarioId+empresaId).
UPDATE "usuario_empresas" ue
SET
  "cargo" = c."cargo",
  "codigoErp" = c."codigoErp",
  "nomeReduzido" = c."nomeReduzido",
  "telefone" = c."telefone",
  "celular" = c."celular",
  "dataNascimento" = c."dataNascimento"
FROM "colaboradores" c
WHERE c."usuarioId" = ue."usuarioId" AND c."empresaId" = ue."empresaId";

-- 3) Remapeia superiorId: era um colaboradores.id, vira o usuario_empresas.id
-- do vínculo com o mesmo usuarioId/empresaId do antigo superior.
UPDATE "usuario_empresas" ue
SET "superiorId" = sup_ue.id
FROM "colaboradores" c
JOIN "colaboradores" sup_c ON sup_c.id = c."superiorId"
JOIN "usuario_empresas" sup_ue
  ON sup_ue."usuarioId" = sup_c."usuarioId" AND sup_ue."empresaId" = sup_c."empresaId"
WHERE c."usuarioId" = ue."usuarioId" AND c."empresaId" = ue."empresaId";

-- 4) Repointa colaboradorId de clientes/notas_saida/titulos_receber/meta_vendedor_mes:
-- valor passa de colaboradores.id para o usuario_empresas.id correspondente.
UPDATE "clientes" cl
SET "colaboradorId" = ue.id
FROM "colaboradores" c
JOIN "usuario_empresas" ue ON ue."usuarioId" = c."usuarioId" AND ue."empresaId" = c."empresaId"
WHERE cl."colaboradorId" = c.id;

UPDATE "notas_saida" ns
SET "colaboradorId" = ue.id
FROM "colaboradores" c
JOIN "usuario_empresas" ue ON ue."usuarioId" = c."usuarioId" AND ue."empresaId" = c."empresaId"
WHERE ns."colaboradorId" = c.id;

UPDATE "titulos_receber" tr
SET "colaboradorId" = ue.id
FROM "colaboradores" c
JOIN "usuario_empresas" ue ON ue."usuarioId" = c."usuarioId" AND ue."empresaId" = c."empresaId"
WHERE tr."colaboradorId" = c.id;

UPDATE "meta_vendedor_mes" mv
SET "colaboradorId" = ue.id
FROM "colaboradores" c
JOIN "usuario_empresas" ue ON ue."usuarioId" = c."usuarioId" AND ue."empresaId" = c."empresaId"
WHERE mv."colaboradorId" = c.id;

-- 5) Rede de segurança: qualquer colaboradorId que não tenha achado um
-- usuario_empresas correspondente (colaborador órfão, sem usuário — caso que
-- deixa de existir) vira NULL, pra não violar a FK nova no passo 7. Não afeta
-- meta_vendedor_mes porque colaboradorId lá é obrigatório (não deveria haver
-- órfão associado a meta; se houver, a linha vira inconsistente e o passo 7
-- vai falhar alto, o que é o comportamento certo — não silenciar).
UPDATE "clientes" SET "colaboradorId" = NULL
  WHERE "colaboradorId" IS NOT NULL AND "colaboradorId" NOT IN (SELECT id FROM "usuario_empresas");
UPDATE "notas_saida" SET "colaboradorId" = NULL
  WHERE "colaboradorId" IS NOT NULL AND "colaboradorId" NOT IN (SELECT id FROM "usuario_empresas");
UPDATE "titulos_receber" SET "colaboradorId" = NULL
  WHERE "colaboradorId" IS NOT NULL AND "colaboradorId" NOT IN (SELECT id FROM "usuario_empresas");

-- 6) Remove as FKs antigas (apontavam pra colaboradores) e a tabela em si.
ALTER TABLE "clientes" DROP CONSTRAINT "clientes_colaboradorId_fkey";
ALTER TABLE "notas_saida" DROP CONSTRAINT "notas_saida_colaboradorId_fkey";
ALTER TABLE "titulos_receber" DROP CONSTRAINT "titulos_receber_colaboradorId_fkey";
ALTER TABLE "meta_vendedor_mes" DROP CONSTRAINT "meta_vendedor_mes_colaboradorId_fkey";
DROP TABLE "colaboradores";

-- 7) Novas FKs apontando pra usuario_empresas, com o mesmo comportamento de
-- ON DELETE que tinham antes.
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_colaboradorId_fkey"
  FOREIGN KEY ("colaboradorId") REFERENCES "usuario_empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notas_saida" ADD CONSTRAINT "notas_saida_colaboradorId_fkey"
  FOREIGN KEY ("colaboradorId") REFERENCES "usuario_empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "titulos_receber" ADD CONSTRAINT "titulos_receber_colaboradorId_fkey"
  FOREIGN KEY ("colaboradorId") REFERENCES "usuario_empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meta_vendedor_mes" ADD CONSTRAINT "meta_vendedor_mes_colaboradorId_fkey"
  FOREIGN KEY ("colaboradorId") REFERENCES "usuario_empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8) Self-relation de hierarquia, agora em usuario_empresas.
ALTER TABLE "usuario_empresas" ADD CONSTRAINT "usuario_empresas_superiorId_fkey"
  FOREIGN KEY ("superiorId") REFERENCES "usuario_empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

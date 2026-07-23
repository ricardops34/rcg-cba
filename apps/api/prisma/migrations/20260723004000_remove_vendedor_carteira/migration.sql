-- Remove o vínculo com vendedor (colaboradorId) de clientes, notas de saída e
-- títulos a receber, e a regra de visão por equipe que dependia dele: os
-- três módulos passam a mostrar a carteira inteira da empresa para qualquer
-- usuário com acesso à rotina.

ALTER TABLE "clientes" DROP CONSTRAINT "clientes_colaboradorId_fkey";
DROP INDEX "clientes_empresaId_colaboradorId_idx";
ALTER TABLE "clientes" DROP COLUMN "colaboradorId";

ALTER TABLE "notas_saida" DROP CONSTRAINT "notas_saida_colaboradorId_fkey";
DROP INDEX "notas_saida_empresaId_colaboradorId_ano_mes_idx";
CREATE INDEX "notas_saida_empresaId_ano_mes_idx" ON "notas_saida"("empresaId", "ano", "mes");
ALTER TABLE "notas_saida" DROP COLUMN "colaboradorId";

ALTER TABLE "titulos_receber" DROP CONSTRAINT "titulos_receber_colaboradorId_fkey";
DROP INDEX "titulos_receber_empresaId_colaboradorId_vencimento_idx";
ALTER TABLE "titulos_receber" DROP COLUMN "colaboradorId";

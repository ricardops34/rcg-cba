-- Seguro e despesas acessórias da nota de entrada, confirmados no dicionário
-- (SX3) do ambiente em 2026-09-08:
--
--   F1_SEGURO   N(15,2)  "Vlr.Seguro"
--   F1_DESPESA  N(15,2)  "Vlr.Despesas"
--
-- Vêm em colunas separadas, e não somados num "outras despesas", porque é
-- assim que a SF1 os guarda — juntá-los impediria conferir a nota da
-- plataforma contra o documento do fornecedor.
--
-- A mesma conferência confirmou os que já existiam: `vlrBruto` é o F1_VALBRUT
-- N(14,2) e `vlrIcmsSt` é o F1_ICMSRET N(14,2) ("ICMS Solid.").

-- AlterTable
ALTER TABLE "notas_entrada" ADD COLUMN     "vlrDespesa" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "vlrSeguro" DOUBLE PRECISION NOT NULL DEFAULT 0;

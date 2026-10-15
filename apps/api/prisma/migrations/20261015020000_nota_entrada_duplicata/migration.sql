-- Nota de entrada: número da duplicata (F1_DUPL) e se gerou contas a pagar,
-- como na nota de saída (F2_DUPL). Nulo = o ERP ainda não informou.
ALTER TABLE "notas_entrada" ADD COLUMN "duplicata" TEXT;
ALTER TABLE "notas_entrada" ADD COLUMN "geraDuplicata" BOOLEAN;

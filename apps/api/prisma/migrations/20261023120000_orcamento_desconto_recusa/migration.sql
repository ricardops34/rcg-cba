-- Aviso no sino do pedido de liberação de desconto (superior) e da resposta
-- (vendedor), e a recusa do pedido com motivo.
ALTER TYPE "NotificacaoTipo" ADD VALUE 'desconto_pendente';
ALTER TYPE "NotificacaoTipo" ADD VALUE 'desconto_liberado';
ALTER TYPE "NotificacaoTipo" ADD VALUE 'desconto_recusado';

ALTER TABLE "orcamentos" ADD COLUMN "descontoRecusadoEm" TIMESTAMP(3);
ALTER TABLE "orcamentos" ADD COLUMN "descontoRecusadoPor" TEXT;
ALTER TABLE "orcamentos" ADD COLUMN "descontoRecusaMotivo" TEXT;

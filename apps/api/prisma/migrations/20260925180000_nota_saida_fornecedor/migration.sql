-- Devolução de compra (nota de saída tipo 'D'): o destinatário é um fornecedor.
-- Até aqui a nota de saída só conhecia cliente, e o código do fornecedor era
-- procurado entre os clientes — 404 na integração, ou a nota ligada ao cliente
-- que tivesse o mesmo código e loja.
--
-- Coluna nova numa tabela que já tem RLS (notas_saida): a policy de tenant
-- existente cobre a linha inteira, nada a acrescentar.

ALTER TABLE "notas_saida" ADD COLUMN "fornecedorId" TEXT;

CREATE INDEX "notas_saida_empresaId_fornecedorId_idx" ON "notas_saida"("empresaId", "fornecedorId");

ALTER TABLE "notas_saida" ADD CONSTRAINT "notas_saida_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

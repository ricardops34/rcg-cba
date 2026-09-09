-- A SF1 guarda dois documentos, não um (confirmado com o usuário em
-- 2026-09-08, ao fechar o mapeamento do Protheus):
--
--   F1_TIPO = 'N'  compra          → o participante é um FORNECEDOR
--   F1_TIPO = 'D'  devolução        → o participante é um CLIENTE
--
-- A modelagem anterior só previa fornecedor, e a devolução ficaria sem para
-- onde apontar. Entra `clienteId` nas duas tabelas — nulo na compra, nulo o
-- `fornecedorId` na devolução.
--
-- Um campo único de "participante" economizaria uma coluna e custaria a chave
-- estrangeira: não haveria como o banco garantir que o código aponta para o
-- cadastro certo, e a consulta por cliente viraria comparação de texto.
--
-- Sai o `ncm` do item: o NCM é do produto (`produtos.ncm`, de `B1_POSIPI`).
-- Repeti-lo na linha da nota criaria duas versões do mesmo dado, livres para
-- divergir — e o item nunca chegou a ser preenchido em base alguma.
--
-- Incremental, e não uma reescrita da `20260908153829`: aquela já está
-- commitada e aplicada, e o Prisma guarda o checksum de cada migration.

-- AlterTable
ALTER TABLE "notas_entrada" ADD COLUMN     "clienteId" TEXT;

-- AlterTable
ALTER TABLE "notas_entrada_itens" DROP COLUMN "ncm",
ADD COLUMN     "clienteId" TEXT;

-- CreateIndex
-- A aba "Devoluções" da Posição de Cliente entra por aqui: um cliente, as
-- notas dele, mais recente primeiro.
CREATE INDEX "notas_entrada_empresaId_clienteId_dtEmissao_idx" ON "notas_entrada"("empresaId", "clienteId", "dtEmissao");

-- CreateIndex
CREATE INDEX "notas_entrada_itens_empresaId_clienteId_produtoId_idx" ON "notas_entrada_itens"("empresaId", "clienteId", "produtoId");

-- AddForeignKey
ALTER TABLE "notas_entrada" ADD CONSTRAINT "notas_entrada_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_entrada_itens" ADD CONSTRAINT "notas_entrada_itens_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

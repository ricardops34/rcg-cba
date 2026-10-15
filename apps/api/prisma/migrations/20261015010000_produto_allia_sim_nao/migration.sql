-- B1_XALLIA é marcação 1=Sim / 2=Não, não código (usuário, 14/10/2026). A
-- coluna de texto da migration anterior nunca recebeu valor.
ALTER TABLE "produtos" DROP COLUMN "codigoAllia";
ALTER TABLE "produtos" ADD COLUMN "produtoAllia" BOOLEAN;

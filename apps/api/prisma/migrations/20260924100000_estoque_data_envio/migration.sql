-- O estoque representa a posição atual por produto e armazém, sem histórico.
-- A data enviada pelo ERP identifica de quando é o saldo; o default preenche
-- as linhas existentes e mantém compatibilidade durante a implantação.
ALTER TABLE "estoques"
  ADD COLUMN "dataEnvio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

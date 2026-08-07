-- Identificação fiscal, endereço e contato da empresa: alimentam o cabeçalho
-- dos documentos emitidos pro cliente (proposta de orçamento em PDF).
-- Todos nullable — as empresas já cadastradas seguem válidas até o admin
-- preencher pela tela de Empresas.

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "complemento" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "endereco" TEXT,
ADD COLUMN     "inscricaoEstadual" TEXT,
ADD COLUMN     "inscricaoMunicipal" TEXT,
ADD COLUMN     "municipio" TEXT,
ADD COLUMN     "site" TEXT,
ADD COLUMN     "telefone" TEXT,
ADD COLUMN     "uf" TEXT;

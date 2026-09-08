-- Empresas existentes são pessoas jurídicas. O campo cnpj preserva seu nome
-- por compatibilidade e passa a guardar CPF quando tipoPessoa = fisica.
ALTER TABLE "empresas" ADD COLUMN "tipoPessoa" "TipoPessoa" NOT NULL DEFAULT 'juridica';

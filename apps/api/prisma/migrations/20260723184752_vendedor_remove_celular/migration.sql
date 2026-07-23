-- Unifica telefone/celular do vendedor num único campo (telefone).
-- Nenhum registro tinha celular preenchido no momento da remoção (0 linhas).
ALTER TABLE "vendedores" DROP COLUMN "celular";

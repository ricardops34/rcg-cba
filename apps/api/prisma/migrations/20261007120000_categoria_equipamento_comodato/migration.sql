-- Categoria de equipamento de comodato: produto de categoria marcada não entra
-- como aplicável de equipamento (ver docs/planos/equipamentos-comodato.md).
-- Nasce desmarcada: quem escolhe as categorias é a empresa, em Cadastros >
-- Categorias.
ALTER TABLE "categorias" ADD COLUMN "equipamentoComodato" BOOLEAN NOT NULL DEFAULT false;

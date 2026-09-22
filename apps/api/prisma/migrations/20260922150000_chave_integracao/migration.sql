-- Chave de integração separada do código (plano docs/planos/2026-09-22-chave-integracao.md).
--
--   chave     -> chave de integração: a chave única do Protheus (X2_UNICO), com
--                "-" entre os campos. É por ela que a integração cadastra,
--                atualiza, exclui e liga os registros. Tela: "Integração".
--   codigoErp -> só informativo, vindo do ERP. Tela: "Código".
--
-- Os dois são independentes: nenhum é calculado a partir do outro. Até aqui o
-- codigoErp guardava a chave; esta migration copia esse valor para `chave` e
-- deixa o codigoErp como está, até o próximo envio do Protheus mandar o
-- código certo.
--
-- Itens (tabela de preço, notas, orçamento, meta por categoria) não têm
-- codigoErp: o item só é visto dentro do documento. A coluna vira `chave`,
-- única dentro do cabeçalho.

-- Cadastros: só as linhas que vieram da integração têm chave.

ALTER TABLE "produtos" ADD COLUMN "chave" TEXT;
UPDATE "produtos" SET "chave" = "codigoErp"
 WHERE "codigoErp" IS NOT NULL
   AND ("createdBy" LIKE 'integracao:%' OR "updatedBy" LIKE 'integracao:%');
DROP INDEX "produtos_empresaId_codigoErp_key";
CREATE UNIQUE INDEX "produtos_empresaId_chave_key" ON "produtos"("empresaId", "chave");
CREATE INDEX "produtos_empresaId_codigoErp_idx" ON "produtos"("empresaId", "codigoErp");

ALTER TABLE "vendedores" ADD COLUMN "chave" TEXT;
UPDATE "vendedores" SET "chave" = "codigoErp"
 WHERE "codigoErp" IS NOT NULL
   AND ("createdBy" LIKE 'integracao:%' OR "updatedBy" LIKE 'integracao:%');
DROP INDEX "vendedores_empresaId_codigoErp_key";
CREATE UNIQUE INDEX "vendedores_empresaId_chave_key" ON "vendedores"("empresaId", "chave");
CREATE INDEX "vendedores_empresaId_codigoErp_idx" ON "vendedores"("empresaId", "codigoErp");

ALTER TABLE "clientes" ADD COLUMN "chave" TEXT;
UPDATE "clientes" SET "chave" = "codigoErp"
 WHERE "codigoErp" IS NOT NULL
   AND ("createdBy" LIKE 'integracao:%' OR "updatedBy" LIKE 'integracao:%');
DROP INDEX "clientes_empresaId_codigoErp_key";
CREATE UNIQUE INDEX "clientes_empresaId_chave_key" ON "clientes"("empresaId", "chave");
CREATE INDEX "clientes_empresaId_codigoErp_idx" ON "clientes"("empresaId", "codigoErp");

ALTER TABLE "categorias" ADD COLUMN "chave" TEXT;
UPDATE "categorias" SET "chave" = "codigoErp"
 WHERE "codigoErp" IS NOT NULL
   AND ("createdBy" LIKE 'integracao:%' OR "updatedBy" LIKE 'integracao:%');
DROP INDEX "categorias_empresaId_codigoErp_key";
CREATE UNIQUE INDEX "categorias_empresaId_chave_key" ON "categorias"("empresaId", "chave");
CREATE INDEX "categorias_empresaId_codigoErp_idx" ON "categorias"("empresaId", "codigoErp");

ALTER TABLE "condicoes_pagamento" ADD COLUMN "chave" TEXT;
UPDATE "condicoes_pagamento" SET "chave" = "codigoErp"
 WHERE "codigoErp" IS NOT NULL
   AND ("createdBy" LIKE 'integracao:%' OR "updatedBy" LIKE 'integracao:%');
DROP INDEX "condicoes_pagamento_empresaId_codigoErp_key";
CREATE UNIQUE INDEX "condicoes_pagamento_empresaId_chave_key" ON "condicoes_pagamento"("empresaId", "chave");
CREATE INDEX "condicoes_pagamento_empresaId_codigoErp_idx" ON "condicoes_pagamento"("empresaId", "codigoErp");

ALTER TABLE "armazens" ADD COLUMN "chave" TEXT;
UPDATE "armazens" SET "chave" = "codigoErp"
 WHERE "codigoErp" IS NOT NULL
   AND ("createdBy" LIKE 'integracao:%' OR "updatedBy" LIKE 'integracao:%');
DROP INDEX "armazens_empresaId_codigoErp_key";
CREATE UNIQUE INDEX "armazens_empresaId_chave_key" ON "armazens"("empresaId", "chave");
CREATE INDEX "armazens_empresaId_codigoErp_idx" ON "armazens"("empresaId", "codigoErp");

ALTER TABLE "tabelas_preco" ADD COLUMN "chave" TEXT;
UPDATE "tabelas_preco" SET "chave" = "codigoErp"
 WHERE "codigoErp" IS NOT NULL
   AND ("createdBy" LIKE 'integracao:%' OR "updatedBy" LIKE 'integracao:%');
DROP INDEX "tabelas_preco_empresaId_codigoErp_key";
CREATE UNIQUE INDEX "tabelas_preco_empresaId_chave_key" ON "tabelas_preco"("empresaId", "chave");
CREATE INDEX "tabelas_preco_empresaId_codigoErp_idx" ON "tabelas_preco"("empresaId", "codigoErp");

ALTER TABLE "regras_desconto" ADD COLUMN "chave" TEXT;
UPDATE "regras_desconto" SET "chave" = "codigoErp"
 WHERE "codigoErp" IS NOT NULL
   AND ("createdBy" LIKE 'integracao:%' OR "updatedBy" LIKE 'integracao:%');
DROP INDEX "regras_desconto_empresaId_codigoErp_key";
CREATE UNIQUE INDEX "regras_desconto_empresaId_chave_key" ON "regras_desconto"("empresaId", "chave");
CREATE INDEX "regras_desconto_empresaId_codigoErp_idx" ON "regras_desconto"("empresaId", "codigoErp");

ALTER TABLE "fornecedores" ADD COLUMN "chave" TEXT;
UPDATE "fornecedores" SET "chave" = "codigoErp"
 WHERE "codigoErp" IS NOT NULL
   AND ("createdBy" LIKE 'integracao:%' OR "updatedBy" LIKE 'integracao:%');
DROP INDEX "fornecedores_empresaId_codigoErp_key";
CREATE UNIQUE INDEX "fornecedores_empresaId_chave_key" ON "fornecedores"("empresaId", "chave");
CREATE INDEX "fornecedores_empresaId_codigoErp_idx" ON "fornecedores"("empresaId", "codigoErp");

-- Cabeçalhos e estoque: o codigoErp que existe veio do ERP e era a chave.

ALTER TABLE "notas_saida" ADD COLUMN "chave" TEXT;
UPDATE "notas_saida" SET "chave" = "codigoErp" WHERE "codigoErp" IS NOT NULL;
DROP INDEX "notas_saida_empresaId_codigoErp_key";
CREATE UNIQUE INDEX "notas_saida_empresaId_chave_key" ON "notas_saida"("empresaId", "chave");
CREATE INDEX "notas_saida_empresaId_codigoErp_idx" ON "notas_saida"("empresaId", "codigoErp");

ALTER TABLE "notas_entrada" ADD COLUMN "chave" TEXT;
UPDATE "notas_entrada" SET "chave" = "codigoErp" WHERE "codigoErp" IS NOT NULL;
DROP INDEX "notas_entrada_empresaId_codigoErp_key";
CREATE UNIQUE INDEX "notas_entrada_empresaId_chave_key" ON "notas_entrada"("empresaId", "chave");
CREATE INDEX "notas_entrada_empresaId_codigoErp_idx" ON "notas_entrada"("empresaId", "codigoErp");

ALTER TABLE "titulos_receber" ADD COLUMN "chave" TEXT;
UPDATE "titulos_receber" SET "chave" = "codigoErp" WHERE "codigoErp" IS NOT NULL;
DROP INDEX "titulos_receber_empresaId_codigoErp_key";
CREATE UNIQUE INDEX "titulos_receber_empresaId_chave_key" ON "titulos_receber"("empresaId", "chave");
CREATE INDEX "titulos_receber_empresaId_codigoErp_idx" ON "titulos_receber"("empresaId", "codigoErp");

ALTER TABLE "estoques" ADD COLUMN "chave" TEXT;
UPDATE "estoques" SET "chave" = "codigoErp" WHERE "codigoErp" IS NOT NULL;
DROP INDEX "estoques_empresaId_codigoErp_key";
CREATE UNIQUE INDEX "estoques_empresaId_chave_key" ON "estoques"("empresaId", "chave");
CREATE INDEX "estoques_empresaId_codigoErp_idx" ON "estoques"("empresaId", "codigoErp");

ALTER TABLE "objetivos_vendedor_mes" ADD COLUMN "chave" TEXT;
UPDATE "objetivos_vendedor_mes" SET "chave" = "codigoErp" WHERE "codigoErp" IS NOT NULL;
DROP INDEX "objetivos_vendedor_mes_empresaId_codigoErp_key";
CREATE UNIQUE INDEX "objetivos_vendedor_mes_empresaId_chave_key" ON "objetivos_vendedor_mes"("empresaId", "chave");
CREATE INDEX "objetivos_vendedor_mes_empresaId_codigoErp_idx" ON "objetivos_vendedor_mes"("empresaId", "codigoErp");

ALTER TABLE "orcamentos" ADD COLUMN "chave" TEXT;
UPDATE "orcamentos" SET "chave" = "codigoErp" WHERE "codigoErp" IS NOT NULL;
DROP INDEX "orcamentos_empresaId_codigoErp_key";
CREATE UNIQUE INDEX "orcamentos_empresaId_chave_key" ON "orcamentos"("empresaId", "chave");
CREATE INDEX "orcamentos_empresaId_codigoErp_idx" ON "orcamentos"("empresaId", "codigoErp");

-- Itens: codigoErp (que era a chave) vira chave, única dentro do cabeçalho.

DROP INDEX "tabela_preco_itens_empresaId_codigoErp_key";
ALTER TABLE "tabela_preco_itens" RENAME COLUMN "codigoErp" TO "chave";
CREATE UNIQUE INDEX "tabela_preco_itens_tabelaPrecoId_chave_key" ON "tabela_preco_itens"("tabelaPrecoId", "chave");

DROP INDEX "notas_saida_itens_empresaId_codigoErp_key";
ALTER TABLE "notas_saida_itens" RENAME COLUMN "codigoErp" TO "chave";
CREATE UNIQUE INDEX "notas_saida_itens_notaSaidaId_chave_key" ON "notas_saida_itens"("notaSaidaId", "chave");

DROP INDEX "notas_entrada_itens_empresaId_codigoErp_key";
ALTER TABLE "notas_entrada_itens" RENAME COLUMN "codigoErp" TO "chave";
CREATE UNIQUE INDEX "notas_entrada_itens_notaEntradaId_chave_key" ON "notas_entrada_itens"("notaEntradaId", "chave");

DROP INDEX "objetivos_vendedor_categoria_empresaId_codigoErp_key";
ALTER TABLE "objetivos_vendedor_categoria" RENAME COLUMN "codigoErp" TO "chave";
CREATE UNIQUE INDEX "objetivos_vendedor_categoria_objetivoVendedorMesId_chave_key" ON "objetivos_vendedor_categoria"("objetivoVendedorMesId", "chave");

ALTER TABLE "orcamento_itens" RENAME COLUMN "codigoErp" TO "chave";
CREATE UNIQUE INDEX "orcamento_itens_orcamentoId_chave_key" ON "orcamento_itens"("orcamentoId", "chave");

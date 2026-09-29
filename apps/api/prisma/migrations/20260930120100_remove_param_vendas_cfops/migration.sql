-- Retira o parâmetro VENDAS_CFOPS_EXCLUIDOS (criado em
-- 20260929220000_param_vendas_cfops_excluidos).
--
-- Ele tirava do realizado os itens de comodato e bonificação por CFOP. A
-- conferência no ERP mostrou que a regra certa é outra — a nota conta se gerou
-- duplicata, e aí todos os itens contam (há comodato cobrado dentro de nota de
-- venda) — e ela entrou em 20260930120000_nota_saida_duplicata. Mantido, o
-- parâmetro seria uma segunda regra para a mesma pergunta; o código já não o
-- lê.

DELETE FROM "parametros_empresa"
WHERE "parametro" = 'VENDAS_CFOPS_EXCLUIDOS';

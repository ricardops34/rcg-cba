-- Condição de pagamento habilitada para o orçamento (decisão do usuário,
-- 17/11/2026): marcação da plataforma, como o `usado` da categoria, editada na
-- listagem de Cadastros > Condições de pagamento. Filtra o seletor do
-- orçamento. Nasce habilitada em todo o cadastro (pedido do usuário): ninguém
-- perde condição no orçamento até alguém desmarcar.
ALTER TABLE "condicoes_pagamento" ADD COLUMN "usadoOrcamento" BOOLEAN NOT NULL DEFAULT true;

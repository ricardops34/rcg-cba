# Orçamento: condição de pagamento e tabela de preços vêm do cliente

Decisão do usuário (2026-10-19): ao incluir orçamento, a condição de pagamento e a tabela de preços
começam as do cadastro do cliente; a troca da tabela depende de parâmetro.

- Parâmetro `ORCAMENTO_ALTERA_TABELA_PRECO` (booleano, padrão falso). A trava é no servidor
  (`resolverTabelaDoOrcamento`): outra tabela com o parâmetro desligado volta 409; tabela inativa 400.
  Reenviar a tabela já gravada no orçamento não conta como troca.
- `orcamentos.tabelaPrecoId` guarda a tabela usada. Nasce `resolverTabelaPrecoCliente` (cadastro do cliente,
  com o padrão de capital/interior quando vazio/inativo — regra antiga, mantida).
- `GET /orcamentos/tabela-preco-cliente?clienteId=` devolve a tabela, `podeAlterar` e as opções (o vendedor
  não tem permissão em /tabelas-preco). `preco-produto` aceita `tabelaPrecoId`.
- Tela: campo "Tabela de preços" (desabilitado sem o parâmetro); trocar refaz o preço das linhas.
- Condição de pagamento já era sugerida pelo cliente, mas o campo ficava em branco quando a condição estava
  inativa ou o vendedor não enxergava a lista; agora soma a do cadastro do cliente às opções.
- Integração (ERP → orçamento) continua pela tabela do cliente; não grava `tabelaPrecoId`.
- Falta: conferência visual; produção (migration `20261019120000_orcamento_tabela_preco`).

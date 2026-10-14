# Módulo de Relatórios

## Decisões (13/10/2026, usuário)

- **Módulo novo "Relatórios"**, para **Administrador, Gerente e
  Administrativo** (o Diretor não foi pedido). Cada relatório com filtros e
  três saídas: **tela, PDF e Excel**.
- Primeiros três relatórios, a partir das planilhas que o usuário usa hoje:
  1. **Compras (itens das notas de entrada)** — Documento, Produto, Descrição,
     Quantidade, UM, Vlr. Unitário, Alíq. IPI, Vlr. Total, Alíq. ICMS,
     Cód. For/Cli, Razão Social, Dt. Digitação.
  2. **Vendas por vendedor (itens das notas de saída)** — Vendedor, Cód.
     Cliente, Nome Cliente, Município, Emissão, Nota Fiscal, Cód. Produto,
     Produto, Quantidade, Vlr. Produto, Vlr. Item. Filtros: vendedor, cliente,
     cidade, NF, código e nome do produto, período.
  3. **Estoque e compra** — Código, Descrição, Cod. Corp., Fornecedor,
     Estoque, Entrada-Qtd, Saída-Qtd, Últ. Preço, Média e a quantidade a
     comprar. Período do movimento (3, 4, 5, 6 meses ou datas) e para quantos
     meses comprar.
- **Alíquotas de IPI e ICMS: do ERP** (`D1_IPI`, `D1_PICM`). O banco só tinha
  os valores. Exige campo novo no item da nota de entrada e a integração
  AdvPL mandando; até lá, a coluna fica vazia.
- **Fornecedor** (relatório 3): o da **última compra** do produto.
- **Cod. Corp.**: o código do fornecedor no ERP, `B1_XFOR` — na plataforma é
  `produtos.codigoFabricante` (é nesse campo que o BJPLA003 o grava).
- **Estoque**: só os armazéns de **revenda**, como a Consulta de Estoque.

## Como funciona

- **Média** = Saída-Qtd ÷ meses do período. **A comprar** = Média × meses de
  compra − Estoque (negativo = sobra), como na planilha (ex.: saída 55 em 3
  meses → média 18,3; × 6 − 0 = 110).
- **PDF e Excel no navegador**, a partir do mesmo JSON da tela — o padrão de
  `apps/web/src/lib/consulta-export.ts` (jsPDF + xlsx).
- Compras e Vendas paginam na tela (podem ter centenas de milhares de itens);
  a exportação busca tudo até um teto e avisa para refinar o filtro acima dele.

## Suposições (confirmar com o usuário)

- **Vendas** (relatório 2) seguem o **mesmo critério das Consultas e do
  Dashboard** (`corteDeVenda`: sem comodato, sem devolução, só nota que gerou
  duplicata e das séries do parâmetro), para os números baterem entre telas.
- **Saída-Qtd** (relatório 3) usa o mesmo critério de venda. Remessa de
  comodato também tira do estoque e **não** entra — se a compra precisa
  cobri-la, vira uma opção.
- **Compras** (relatório 1) e **Entrada-Qtd** trazem todas as notas de entrada
  não canceladas (compra e devolução de cliente — por isso "Cód. For/Cli").

## Permissões

Rotinas `relatorio-compras`, `relatorio-vendas`, `relatorio-estoque-compra`
(ações `visualizar` e `exportar`). A migration cria módulo, menus e rotinas
(ignorando os que existem — o `sincronizar-catalogo` roda depois do deploy) e
concede aos perfis **Gerente** e **Administrativo** por nome, como
`20261007033504_equipamentos_comodato`. Os administradores (`sistemaBase`)
têm tudo pelo `isAdmin`.

## Situação (13/10/2026) **[verificado em dev, pela API; telas abrem, conferência visual pendente]**

- Os três relatórios na API (`/relatorios/compras`, `/vendas`, `/estoque-compra`)
  e no web (`/relatorios/...`), com PDF e Excel no navegador
  (`lib/relatorio-export.ts`). Teto da exportação: 20.000 linhas, com aviso.
- RCG, 01/01 a 30/09/2026: compras 4.437 itens; vendas 10.446 itens
  (exportação em 1,6 s); estoque e compra ~1.300 produtos com movimento.
- Permissões: Gerente (os dois) e Administrativo recebem visualizar/exportar
  pela migration `20261013230000_modulo_relatorios`; sem permissão, 403.
- Alíquotas: coluna `aliqIpi`/`aliqIcms` no item da nota de entrada
  (migration `20261013220000_nota_entrada_item_aliquotas`) e aceitas na
  integração; **falta o BJPLA003 mandar** (`D1_IPI`, `D1_PICM`).
- Leitura com transação de até 60 s: a padrão (5 s) expirou no primeiro
  acesso depois de subir a API.

### Achados ao comparar com a planilha (HIGINDOOR 560 -20L)

- **Fornecedor** saía como a transportadora: o CT-e de frete (tipo C,
  quantidade 0) leva o código do produto no ERP. Corrigido: só nota de compra.
- **Últ. preço**: no cadastro está 0 para vários produtos; passa a usar o da
  última compra quando o do cadastro é zero. O 139,18 da planilha não aparece
  em lugar nenhum da base — de onde a planilha tira (B1_UPRC? outra unidade?)
  **a confirmar**.
- **Saída-Qtd**: a planilha diz 6; a base tem 2 em notas de saída no período
  (todas de venda). As 4 restantes vêm de outro período ou de movimento
  interno do ERP (requisição/SD3) que não é integrado — **a confirmar**.

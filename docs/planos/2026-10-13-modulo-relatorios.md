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
- **Últ. preço**: **o unitário da última nota de compra** (decisão do usuário,
  13/10/2026). O `ultimoPreco` do cadastro vem do `B1_PRV1` (preço de
  venda, no BJPLA003) e não é usado aqui.
- **Saída-Qtd**: a planilha diz 6; a base tem 2 em notas de saída no período
  (todas de venda). As 4 restantes vêm de outro período ou de movimento
  interno do ERP (requisição/SD3) que não é integrado — **a confirmar**.

## Ajustes de 14/10/2026 (usuário)

- **Compra = NF de entrada do tipo normal, de mercadoria** — sem CT-e e sem
  serviço. Na base, "tipo N" sozinho não basta (25 mil CT-e são tipo N), então
  o corte é `tipo = 'N'` **e** espécie `SPED`, `NFE`, `NF` ou `NFA`
  (`ESPECIES_DE_COMPRA` em `relatorios.service.ts`). Fora: CTE/CTR (frete),
  NFS/RPS/NFPS (serviço), NF3E/NFCEE (energia), NTST/NFSC/NTSC (telecom),
  NFCE (cupom), NFFA (fatura) e devolução (tipo D). Vale para o relatório de
  Compras, a Entrada-Qtd e o fornecedor/preço da última compra. RCG jan–set:
  4.437 → 2.333 itens. **Conferir a lista de espécies com o usuário.**
- **Filtro de categoria** nos três relatórios (categoria ou subcategoria do
  produto). A lista de categorias passa a valer para quem tem um relatório
  (o Gerente não tem o cadastro de categorias).

## Filtros com seleção múltipla e cortina (14/10/2026, usuário)

Pedido: em produto, fornecedor e categoria, pesquisar por nome, código, CNPJ,
razão social e ir selecionando vários; tela mais enxuta.

- **Produto, fornecedor e cliente** viram seleção múltipla com busca no
  servidor (`BuscaMultiSelect`, `components/relatorios/filtros-selecao.tsx`).
  A busca é por termos: produto em código, descrição, Cod. Corp. e EAN;
  fornecedor/cliente em código, razão social, fantasia e CNPJ/CPF (com ou sem
  pontuação). Até 100 resultados; "Marcar todos os N resultados" substitui o
  antigo filtro "contém" (buscar `HIGIN` e marcar tudo).
- **Categoria** também múltipla (lista local).
- A API passa a receber ids (`produtoIds`, `fornecedorIds`, `clienteIds`,
  `categoriaIds`, separados por vírgula) e deixa de aceitar os textos
  `produto`, `fornecedor`, `cliente`, `produtoCodigo`, `produtoNome`,
  `categoriaId`. Ficam como texto: documento/NF, cidade e Cod. Corp.
- **Opções**: rota própria `GET /relatorios/opcoes/:tipo` para quem tem
  qualquer relatório — o Gerente não tem o cadastro de fornecedores; a rota
  devolve só id, código, nome e um detalhe (CNPJ, cidade, Cod. Corp.).
- **Cortina**: período, **Filtros (n)** e **Gerar** sempre à vista; os demais
  numa área recolhível que fecha ao gerar. O que está escolhido aparece como
  chip com × para tirar.
- Estoque e compra: o filtro de fornecedor é pelo **id do fornecedor da
  última compra** (antes, texto na razão social).

**Situação:** tipos (api/web), lint e testes do módulo ok; **não validado
ponta a ponta** — Docker parado em 14/10. Falta a conferência na tela.

## Códigos do fabricante e Allia no produto (14/10/2026, usuário)

O produto não tinha `B1_XCOD` (Cod. Fabric.), `B1_XXDESC` (Desc. Fabric) e
`B1_XALLIA` (Prod. Allia). O que a tela chamava de "código/descrição no
fabricante" era `B1_XFOR`/`B1_XDESFOR` — do **fornecedor**.

- Campos novos em `produtos`: `codigoNoFabricante` (B1_XCOD),
  `descricaoNoFabricante` (B1_XXDESC), `codigoAllia` (B1_XALLIA) — migration
  `20261014230000_produto_codigos_fabricante_allia`. Os antigos mantêm o nome
  (`codigoFabricante` = B1_XFOR, `descricaoFabricante` = B1_XDESFOR); a tela
  passou a chamá-los de "no fornecedor".
- BJPLA003 (`BJMAPPRD`) envia os três (com `FieldPos`, vazio = Nil).
- Cadastro do produto (aba Fabricante) mostra os cinco; a busca do cadastro e
  a dos relatórios encontram por Cod. Corp., Cód. no fabricante e Allia.

**Falta:** aplicar a migration, compilar o BJPLA003 no Protheus e reenviar os
produtos (os campos só chegam quando o produto for reenviado).

## Tela mais enxuta, ordenação, colunas e valores de imposto (14/10/2026, usuário)

- **Filtros numa linha**: período (e vendedor, nas Vendas), chips do que está
  escolhido, **Filtros** e **Gerar**. Os demais filtros abrem numa cortina
  lateral (Sheet) com **Aplicar** e **Limpar** — não empurram a tabela.
  Cabeçalho da página menor; contagem, totais, Colunas, PDF e Excel numa
  barra só.
- **Ordenar por qualquer coluna**: Compras e Vendas no servidor (`ordem`,
  `sentido`; lista fechada em `ORDEM_COMPRAS`/`ORDEM_VENDAS`, fora dela vale a
  padrão, que também desempata). PDF e Excel saem na mesma ordem. Estoque e
  compra já ordenava no navegador.
- **Escolher colunas** (`components/relatorios/colunas.tsx`): vale para a
  tela, o PDF e o Excel; guardado no navegador, por usuário. O total segue a
  coluna (`totais[campo]`), não a posição.
- **Compras: Vlr. IPI, Vlr. ICMS e Vlr. ICMS ST** do item (já vinham do
  BJPLA003: `D1_VALIPI`, `D1_VALICM`, ICMS ST), com total.

**Verificado em dev (14/10)**, com token de Gerente: busca de
fornecedor/produto/cliente (inclusive CNPJ só dígitos), tipo inválido = 400,
ordenação de Compras e Vendas, `ordem=__proto__` cai na padrão, filtros por
id nos três relatórios. RCG jan–set: 2.333 itens; IPI R$ 38.417,34, ICMS
R$ 127.707,92, ICMS ST R$ 307.623,10. Telas compilam (HTTP 200). Migrations
`20261014213147` e `20261014230000` aplicadas na base de dev. **Falta a
conferência visual** no navegador.

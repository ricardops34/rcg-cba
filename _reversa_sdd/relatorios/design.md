# relatorios — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `relatorios`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `compras — GET /relatorios/compras` | ``relatorio-compras.visualizar` (+ `exportar` se `pageSize` > 200)` | `paginado, totais de quantidade/valor/IPI/ICMS/ST` | 200 OK |
| `vendas — GET /relatorios/vendas` | ``relatorio-vendas.visualizar` (+ `exportar` se `pageSize` > 200)` | `paginado, totais de quantidade e valor` | 200 OK |
| `vendasPorVendedor — GET /relatorios/vendas-por-vendedor` | ``relatorio-vendas.visualizar`` | `matriz cliente × mês (até 12), quebra por vendedor` | 200 OK |
| `estoqueCompra — GET /relatorios/estoque-compra` | ``relatorio-estoque-compra.visualizar`` | `uma linha por produto, sem paginação` | 200 OK |
| `opcoes — GET /relatorios/opcoes/:tipo` | `qualquer um dos três `visualizar`` | `até 100 opções (`produtos`, `fornecedores`, `clientes`): código, nome, detalhe` | 200 OK |

## Fluxo Principal

### 1. 3.1 Exportar = página grande

`exigirExportarSeGrande`: com `pageSize` acima de 200 (`MAXIMO_DA_TELA`), exige
`<rotina>.exportar`, exceto para `isAdmin`. O contrato aceita `pageSize` até 20000.

### 2. 3.2 Período civil

`periodo(inicio, fim)`: `[inicio 00:00Z, fim + 1 dia)`. Fim antes do início dá 400.

### 3. 3.3 O que é compra (decisões do usuário, 13–14/10/2026)

- Nota de entrada `tipo='N'`, espécie em `SPED`, `NFE`, `NF`, `NFA` (fora CT-e, serviço,
  energia, telecom, cupom, fatura e devolução de cliente).
- Gerou contas a pagar (`geraDuplicata` verdadeiro **ou nulo**, para a nota que chegou
  antes de a integração mandar o campo).
- Fornecedor **ativo** (bloqueado no ERP fica de fora dos itens e da lista do filtro).
- Período pela data de digitação (`dtEntrada`, ou `dtEmissao` quando não houver).

### 4. 3.4 Categoria "usada", mais estrita que o Dashboard

Os relatórios só trazem produto de categoria com `usado = true`; a categoria **em
branco fica de fora**. No `corteDeVenda` do Dashboard e das Consultas ela conta, e por
isso o Relatório de Vendas pode dar **menos** que o Dashboard (decisão de 14/10/2026,
registrada no código). O filtro de categoria aceita a categoria **ou** a subcategoria.

### 5. 3.5 Vendas

`corteDeVenda.item` + emissão no período + categoria usada; filtros de vendedor (pelo
**cabeçalho**), cliente, município (`contains`), categoria, número da nota e produto.
Ordem padrão: vendedor, emissão, número, item, id. A coluna clicada vem primeiro, e a
padrão desempata (sem repetir nem pular linha entre páginas).

### 6. 3.6 Vendas por vendedor (mensal)

SQL bruto agrupando (vendedor do cabeçalho, cliente, `to_char(dtEmissao,'YYYY-MM')`),
com a lista de meses gerada do início ao fim (até 12, pelo contrato). Monta uma linha
por (vendedor, cliente) com quantidade e valor por mês e no total. `quebraPorVendedor` =
controle da tela, senão o parâmetro `RELATORIO_VENDAS_QUEBRA_VENDEDOR` (padrão `true`).
A linha **sempre** vem por vendedor; a tela decide se agrupa. O mês **não** pode ir pelo
alias no `GROUP BY`, porque `notas_saida_itens` já tem uma coluna `mes`.

### 7. 3.7 Estoque e compra

- **Estoque** = soma do saldo dos armazéns com `revenda = true`.
- **Entradas** = quantidade das notas de compra (§3.3) no período.
- **Saídas** = quantidade dos itens das notas de **venda** (cabeçalho de `corteDeVenda`)
  no período, sem o filtro de categoria do item.
- **Fornecedor e último preço** = os da última nota de compra com quantidade > 0
  (`LATERAL ... LIMIT 1`, ordenado por data desc e, no empate, pelo maior unitário).
  Isso exclui o CT-e de frete, que levava o código do produto. Depois de 15/10/2026 o
  cálculo roda só para os produtos filtrados, porque era o gargalo.
- `mesesPeriodo` = atalho da tela (3 a 6) ou dias ÷ 30,44.
- **Média** = saídas ÷ `mesesPeriodo`. **A comprar** = média × `mesesCompra` − estoque,
  com 1 casa; negativo significa sobra. É a fórmula da planilha de compra, coberta pelo spec.
- Produto inativo só entra se tiver saldo ou movimento; `comMovimento` exige movimento
  de todos.

### 8. 3.8 Opções

A busca por termos (`condicaoBuscaTermosSql`) cobre código, nome, fantasia e CNPJ/CPF
(também só com dígitos); no produto, também Cod. Corp., código e descrição no
fabricante e código de barras. Os ativos vêm antes. Produtos só de categoria usada;
fornecedores só ativos. Limite de 100.

### 9. 3.9 Achados

- 🟡 **Sem escopo hierárquico.** Nenhuma rota chama `resolverEscopoVendedores`: quem tem
  a permissão vê a empresa inteira (vendas de todos os vendedores, todos os clientes nas
  opções). Para Gerente e Administrativo isso é o desenho do plano. Mas a barreira é só
  a permissão: um perfil de Vendedor que receba `relatorio-vendas` passa a ver a venda
  de todos, ao contrário das Consultas.
- 🟡 **Exportar não vale em duas rotas.** `vendas-por-vendedor` e `estoque-compra`
  devolvem tudo sem paginação e sem `exigirExportarSeGrande`. Quem só tem `visualizar`
  já recebe o conjunto inteiro, e a trava de exportar fica só no botão.
- 🟡 **Saídas sem comodato nem bonificação** (🟡 INFERIDO quanto ao efeito). As saídas
  usam o corte de **venda** (comodato e nota sem duplicata ficam de fora). Remessa de
  comodato, bonificação e transferência também tiram produto do estoque, então a média
  de saída e o "a comprar" podem ficar **abaixo** do consumo real.
- 🟡 **Comentários contraditórios sobre o fornecedor bloqueado.** O topo do arquivo
  diz que ele sai "nem na lista do filtro nem nos itens", e o código das compras
  realmente o exclui. O comentário em `opcoes` diz que "a nota antiga dele continua no
  relatório".
- 🟡 **Mês por emissão** (`to_char(dtEmissao)`) no relatório mensal, enquanto as
  Consultas usam `n.ano/mes` do ERP. O mesmo período pode distribuir valores em meses
  diferentes se as duas datas divergirem.
- 🟡 Compras e Vendas não têm limite de período; com `pageSize` 20000 e 60 s de timeout,
  a exportação de períodos longos depende do tempo do banco.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ParametrosService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/vendas/venda-analitica`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/busca/termos-busca`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/relatorios` | 🟢 |

## Estado Interno e Entidades

- Dados mantidos nas tabelas do módulo com isolamento multi-tenant. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.


# consultas — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `consultas`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `vendasPorCliente — GET /consultas/vendas-cliente` | ``consulta-vendas-cliente.visualizar`` | `cliente` | `n.vendedorId` |
| `vendasPorVendedor — GET /consultas/vendas-vendedor` | ``consulta-vendas-vendedor.visualizar`` | `vendedor` | `n.vendedorId` |
| `vendasPorProduto — GET /consultas/vendas-produto` | ``consulta-vendas-produto.visualizar`` | `produto (+ `categoriaId?`)` | `i.vendedorId` |
| `vendasPorCategoria — GET /consultas/vendas-categoria` | ``consulta-vendas-categoria.visualizar`` | `categoria → sub → produto` | `i.vendedorId` |
| `evolucao — GET /consultas/evolucao` | ``consulta-evolucao.visualizar`` | `vendedor, por indicador` | ver §3.6 |

## Fluxo Principal

### 1. 3.1 Base do vendedor

`baseVendedor`: a escolha da consulta (`?baseVendedor=`) ganha; senão vale o parâmetro
`CONSULTA_VENDAS_BASE_VENDEDOR` (padrão `nota`). Com `nota`, a venda é creditada a quem
vendeu; com `cliente`, ao titular da carteira.

### 2. 3.2 Dupla trava de visibilidade

1. `condicaoEscopoClientes`: com escopo restrito, só clientes cujo `c.vendedorId` está
   no escopo. Escopo vazio vira `false`.
2. `condicaoFiltroVendedor`: sem filtro pedido, a **coluna da base** também precisa
   estar no escopo (regra de 30/09/2026: o vendedor vê só os próprios dados, o
   supervisor vê os do time). Com filtro pedido, os ids fora do escopo são descartados;
   se não sobrar nenhum, o resultado é vazio (`false`), nunca "todos".

### 3. 3.3 O que é venda e o valor

`corteDeVenda` (ver `objetivos` §3.1), nas formas `notaSql` e `itemSql`. O valor é
`SUM(i.vlrTotal)`, que é o **item**, e não mais o `vlrBruto` do cabeçalho, para
respeitar a categoria. Em troca, IPI/ST e frete do cabeçalho deixam de entrar. A
Posição de Cliente continua no `vlrBruto`.

### 4. 3.4 Período e pivô

- Período: `(ano×12 + mes) BETWEEN emMeses(inicial) AND emMeses(final)`, com no máximo
  12 meses (`MAX_MESES_CONSULTA`, validado no contrato).
- `pivotar`: soma cada (entidade, ano, mês) na coluna do mês, ordena pelo total
  decrescente e calcula os totais por coluna.
- **Média = total ÷ meses com valor diferente de zero**, e não ÷ tamanho do período: é
  o quanto o cliente compra quando compra.

### 5. 3.5 Árvore de categorias

Uma passada: cada linha (produto, ano, mês) soma no produto, na subcategoria, na
categoria e no rodapé ao mesmo tempo, então os níveis não divergem. Produto sem
classificação vai para os nós `sem-categoria` / `sem-subcategoria`, para o total bater
com a consulta por produto. Cada nível sai ordenado pelo total.

### 6. 3.6 Evolução

| Indicador | Medida | Origem | Base |
|---|---|---|---|
| `vendas` | `SUM(i.vlrTotal)` | notas de venda | escolhida |
| `positivados` | `COUNT(DISTINCT n.clienteId)` | notas de venda (item acompanhado) | escolhida |
| `novos` | nº de clientes cuja **primeira** nota de venda de todo o histórico cai no mês | CTE `DISTINCT ON (clienteId)` ordenada por ano, mês, `dtEmissao` | escolhida (`nota` = quem emitiu a primeira) |
| `inativados` | nº de clientes com `dataBloqueio` no mês | cadastro do cliente | sempre `cliente` (a resposta devolve `cliente`) |

`novos` e `positivados` também usam o corte por item: o cliente não "estreia" numa
remessa de brinde. `inativados` conta o bloqueio registrado mesmo se o cliente foi
reativado depois.

### 7. 3.7 Achados

- 🟡 **Devolução fora das Consultas** (🟡 INFERIDO quanto ao impacto). As Consultas somam
  `vlrTotal`; Dashboard e Objetivos somam `vlrTotal − vlrDev`. A nota de devolução já sai
  pelo `tipo='N'`, mas o `vlrDev` lançado no item original só é descontado nos
  Dashboards. O comentário de `mediaMesesComMovimento` fala em "líquido", mas o valor
  das Consultas é bruto de devolução. Os documentos das rotas dizem que as três telas
  usam a "mesma base". Para o mesmo mês, os números divergem sempre que houver `vlrDev`.
- 🟡 **Cabeçalho × item no vendedor e no mês.** Cliente, vendedor e evolução usam
  `n.vendedorId` e `n.ano/mes`; produto e categoria usam `i.vendedorId` e `i.ano/mes`.
  Se o vendedor ou o mês do item diferir do cabeçalho, o total por vendedor e o total
  por produto filtrado pelo mesmo vendedor não batem. O Dashboard usa os campos do item.
- 🟡 `evolucaoNovos` varre **todo o histórico** de notas de venda a cada chamada para
  achar a primeira compra.
- 🟡 `vendedoresRef` devolve o nome de qualquer vendedor da empresa cujo id venha na
  query, mesmo fora do escopo. Os números não vazam (o filtro descarta), só o nome no
  cabeçalho.
- 🟡 Mês de `inativados` sai de `EXTRACT` sobre `dataBloqueio` no fuso do banco.
- 🟡 Exportar é decidido só na tela (os dados já chegaram a quem visualiza). Está
  documentado como intencional.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ParametrosService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/escopo/escopo-vendedores`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/vendas/venda-analitica`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/consultas` | 🟢 |
| **Constante Parametrizada `Parâmetro CONSULTA_VENDAS_BASE_VENDEDOR`:** `cliente` | `apps/api/src/modules/consultas` | 🟢 |

## Estado Interno e Entidades

- Dados mantidos nas tabelas do módulo com isolamento multi-tenant. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.


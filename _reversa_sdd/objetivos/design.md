# objetivos — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `objetivos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `dashboard — GET /objetivos/dashboard` | ``dashboard-comercial.visualizar`` | `meta × realizado do mês no escopo (ou no vendedor); positivação, base, devolução, tabela por categoria **usada**` | 200 OK |
| `municipiosDashboard — GET /objetivos/dashboard/municipios` | ``dashboard-comercial.visualizar`` | `municípios distintos dos clientes **com venda** no mês` | 200 OK |
| `dashboardGerencial — GET /objetivos/dashboard-gerencial` | ``dashboard-gerencial.visualizar`` | `linhas por vendedor + resumo + responsáveis + parâmetro de agrupamento` | 200 OK |
| `clientesSemVendedor — GET …/dashboard-gerencial/clientes-sem-vendedor` | ``dashboard-gerencial.visualizar`` | `detalhe do card; vazio em escopo restrito` | 200 OK |
| `dashboardGerencialVendedor — GET …/dashboard-gerencial/vendedor/:vendedorId` | ``dashboard-gerencial.visualizar`` | `mês do vendedor por categoria; 404 fora do escopo` | 200 OK |
| `findAll — GET /objetivos` | ``objetivos.visualizar`` | `paginado; `ano`, `mes`, `vendedorId`, `ativo`; ordem padrão `ano` + `mes desc`` | 200 OK |
| `findOne — GET /objetivos/:id` | ``objetivos.visualizar`` | `404 fora do escopo` | 200 OK |
| `create — POST /objetivos` | ``objetivos.cadastrar`` | `vendedor no escopo; sem duplicidade vendedor/mês/ano; cria as linhas por categoria` | 200 OK |
| `copiarPeriodo — POST /objetivos/copiar-periodo` | ``objetivos.cadastrar`` | `replica o mês de origem com reajuste; pula quem já tem meta no destino` | 200 OK |
| `update — PATCH /objetivos/:id` | ``objetivos.editar`` | `revalida duplicidade; `categorias` enviadas **substituem** o conjunto inteiro` | 200 OK |
| `remove — DELETE /objetivos/:id` | ``objetivos.excluir`` | `soft delete (`deletedAt`, `deletedBy`, `ativo=false`)` | 200 OK |

## Fluxo Principal

### 1. 3.1 O que é "venda" — `corteDeVenda`

Regra única para Dashboards, Objetivos e Consultas (`common/vendas/venda-analitica.ts`).

- **Cabeçalho:** nota não excluída e ativa, `comodato=false`, `tipo='N'` e **gerou
  duplicata** (`geraDuplicata=true`, ou `geraDuplicata` nulo com condição de pagamento,
  para nota de integração antiga). Se o parâmetro `VENDAS_SERIES_NOTA` estiver
  preenchido, só entram essas séries.
- **Item:** não excluído e ativo, e a categoria do produto **não** está recusada
  (`usado` verdadeiro ou nulo; item sem produto ou sem categoria conta).
- Conferido no ERP em 2026-09-29: 10 de 11 vendedores bateram ao centavo.

**Realizado** por item = `vlrTotal − vlrDev`. É uma aproximação do `vlr_liquido` do
legado, que não foi importado no item.

### 2. 3.2 Dashboard Comercial

- Meta: soma dos objetivos **ativos** do mês no filtro de vendedor; `numeroCliente`
  somado; meta por categoria somada das linhas.
- Realizado: `groupBy produtoId` dos itens → categoria do produto → mapa por categoria.
- Positivação: clientes distintos com item no mês.
- Base: clientes ativos da carteira (`cliente.vendedorId`) no filtro.
- `municipio` recorta venda e base, **não** a meta (não existe meta por município).
- Tabela: só categorias com `usado=true`, ordenadas por `codigoErp`. Categoria em branco
  entra no KPI, mas não ganha linha.
- `perc(n, d)` = `round(n×10000/d)/100`; zero quando `d=0`.

### 3. 3.3 Dashboard Gerencial

- Seis leituras em paralelo: objetivos do mês, realizado por vendedor, pares
  (vendedor, cliente), base, clientes sem vendedor ativo e pares (nota, vendedor).
- **Linhas:** só vendedores com meta ou movimento, `tipo='vendedor'` **e**
  `usaDashboard=true`. Supervisor e gerente não viram linha: a venda é sempre do
  vendedor que atende o cliente. Eles aparecem em `responsaveis` como agrupadores (pelo
  `superiorId`).
- **Cartões do topo:** somam a operação inteira do escopo, **inclusive** quem não vira
  linha (ESCRITÓRIO, E-COMMERCE). É intencional, para bater com o Comercial e as
  Consultas.
- **Positivação do cartão** = soma das linhas: o cliente que comprou de dois vendedores
  conta duas vezes. Decisão do usuário em 2026-09-30, para bater com o sistema anterior.
- **Ticket médio** = realizado ÷ nº de notas distintas **com item que entrou no
  realizado** e com vendedor. Nota só de comodato ou de categoria recusada não conta (em
  09/2026 eram 147 de 621).
- **Clientes sem vendedor ativo** = cliente ativo com `vendedorId` nulo, ou com vendedor
  inativo ou excluído. Só é calculado com escopo livre; em escopo restrito vale 0.
- O parâmetro `DASHBOARD_GERENCIAL_HIERARQUIA` (padrão `true`) diz se a tela agrupa por
  hierarquia.

### 4. 3.4 Detalhe do vendedor

O vendedor fora do escopo ou inexistente responde 404. A meta e o realizado saem por
categoria (inclusive categoria só com meta ou só com venda), e o realizado de produto
sem categoria vem à parte (`realizadoSemCategoria`). **Não** filtra `usado=true`, ao
contrário do Comercial.

### 5. 3.5 Clientes sem vendedor

Até 1000 clientes (`LIMITE_CLIENTES_SEM_VENDEDOR`) em ordem alfabética, com o `total`
real. A "última compra" é a mais recente entre `cliente.ultimaCompra` (do import) e a
última nota de venda. A lista sai ordenada por última compra, decrescente.

### 6. 3.6 Cópia de período

`fator = 1 + percReajuste/100` (de −100 a 1000); `ajustar(v) = round(v×fator×100)/100`
aplicado à meta e às linhas por categoria. As quantidades (`numeroCliente`,
`novoCliente`) são copiadas sem reajuste. O vendedor que já tem objetivo no destino é
**pulado**, e o retorno diz quantos e quais foram. Respeita o escopo. `codigoErp` e
`chave` ficam nulos na cópia. O contrato proíbe destino igual à origem.

### 7. 3.7 Achados

- 🔴 **A unicidade ignora o soft delete.** O schema tem
  `@@unique([empresaId, vendedorId, mes, ano])` sem `deletedAt`, e o projeto não tem
  filtro global para `P2002`. Consequências:
  - excluir o objetivo de um vendedor e criar de novo no mesmo mês passa por
    `garantirSemDuplicidade` (que filtra `deletedAt: null`) e estoura erro 500 no banco;
  - `copiarPeriodo` para um mês com objetivo excluído do mesmo vendedor derruba a
    transação inteira, e **nenhum** objetivo é copiado.
- 🟡 **`update` com `categorias` apaga as linhas fisicamente** (`deleteMany`), embora a
  tabela tenha colunas de soft delete. As linhas que vieram do ERP (`chave`) perdem a
  chave, e a próxima carga da integração tende a recriá-las.
- 🟡 **Lista de clientes sem vendedor cortada antes de ordenar.** O `take: 1000` é
  aplicado em ordem alfabética, e só depois a lista é reordenada por última compra. Com
  mais de 1000 clientes, quem comprou recentemente pode ficar de fora.
- 🟡 **Positivação diferente entre os dashboards.** O Comercial conta clientes
  distintos; o Gerencial soma as linhas (§3.3). Pela decisão do usuário, o mesmo mês
  pode mostrar dois números.
- 🟡 **Categoria recusada no detalhe.** O detalhe do vendedor lista categorias com meta
  mesmo quando estão marcadas como não usadas. O realizado delas é sempre 0 (o corte
  exclui), e a linha aparece com 0% de atingimento.
- 🟡 **Base × positivação em dimensões diferentes.** A base filtra pela carteira do
  cliente (`cliente.vendedorId`); a positivação e o realizado, pelo `vendedorId` do
  **item** da nota.
- 🟡 Valores em `Float` (`valor`, `numeroCliente`, `novoCliente`). Os dois últimos são
  contagens de clientes.
- 🟡 `copiarPeriodo` copia também objetivos `ativo=false` e linhas de categorias que
  podem ter sido desativadas.
- 🟡 `Promise.all` dentro da transação interativa (vários pontos).

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ParametrosService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/escopo/escopo-vendedores`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/vendas/venda-analitica`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/pagination/paginate`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/objetivos` | 🟢 |

## Estado Interno e Entidades

- **`ObjetivoVendedorMes`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`ObjetivoVendedorCategoria`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.


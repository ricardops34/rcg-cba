# equipamentos-comodato — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `equipamentos-comodato`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `findAll — GET /equipamentos-comodato` | ``visualizar`` | `filtros `ativo`, `semAplicacao`, busca em descrição/código do produto; ordem descricao/categoria/codigoErp/createdAt; `totalClientes` e `totalAplicacoes` por linha` | 200 OK |
| `findOne — GET /:id` | ``visualizar`` | `equipamento + aplicações (ordem, descrição)` | 200 OK |
| `create — POST` | ``cadastrar`` | `produto da empresa e não excluído; 409 se já é equipamento; **excluído volta** na mesma linha, com as aplicações` | 200 OK |
| `update — PATCH /:id` | ``editar`` | `só `observacao` e `ativo`` | 200 OK |
| `remove — DELETE /:id` | ``excluir`` | `soft delete; aplicações ficam (são do produto)` | 200 OK |
| `removerLote — POST /excluir-lote` | ``excluir`` | `soft delete só dos **sem** aplicação; devolve quantos ficaram por ter` | 200 OK |
| `adicionarAplicacao / adicionarAplicacoesLote — POST /:id/aplicacoes[/lote]` | ``editar`` | `via `ProdutoRelacionadosService.criar`; o lote (até 100) segue item a item e devolve `recusados` com o motivo` | 200 OK |
| `removerAplicacao — DELETE /:id/aplicacoes/:relacaoId` | ``editar`` | `só a relação **deste** equipamento (confere `produtoId` e `tipo`)` | 200 OK |
| `sugestoes — GET /:id/sugestoes?categoriaId=` | ``visualizar`` | `compra conjunta acima da média (§3.1)` | 200 OK |
| `comuns — GET /:id/comuns?minimo=&categoriaId=` | ``visualizar`` | `itens por subcategoria entre quem está com o equipamento (§3.2)` | 200 OK |
| `popular — POST /popular` | ``importar`` | `cria/regera equipamentos a partir das remessas (§3.3)` | 200 OK |
| `categoriasPopular — GET /popular/categorias` | ``importar`` | `categorias raiz dos produtos que saíram em comodato, com contagem` | 200 OK |
| `categoriasSugestoes — GET /sugestoes/categorias` | ``visualizar`` | `categorias raiz ativas que **não** são de equipamento` | 200 OK |

## Fluxo Principal

### 1. 3.1 Sugestões por compra conjunta ("lift")  — `flowcharts/equipamentos-comodato-sugestoes.md`

- `cli_eq`: clientes que **algum dia** receberam o equipamento (item `comodato = true`).
- `venda`: pares (cliente, produto) de venda nos últimos **24 meses** — nota tipo `N`,
  `geraDuplicata`, não comodato.
- Para cada produto: `comEquipamento` = clientes com equipamento que compraram; `geral` =
  todos que compraram. Entra se `comEquipamento ≥ 3` **e** a taxa entre quem tem o
  equipamento for **mais de 1,5×** a taxa geral (`comEq/totalComEq > 1,5 · geral/totalGeral`).
- Saem: o próprio equipamento, o que já é aplicação, o que é equipamento, o de categoria
  marcada `equipamentoComodato`; filtro opcional de categoria **antes** do corte.
- Corte de 40 candidatos por `comEquipamento`; depois reordena pela **descrição parecida**
  (§3.4) e devolve 20.
- Constantes "medidas em 2026-10-07": `SUGESTAO_MESES=24`, `MIN_CLIENTES=3`, `MIN_LIFT=1.5`,
  `CANDIDATOS=40`, `LIMITE=20`.

### 2. 3.2 Itens comuns por subcategoria  — `flowcharts/equipamentos-comodato-comuns.md`

- `em_poder`: clientes **ainda** com o equipamento — remessa (saída comodato) menos
  retorno (entrada comodato), `SUM > 0`.
- Base = os que compraram algo nos últimos 24 meses; agrupa os produtos comprados por
  **subcategoria** e mantém os grupos com cobertura `≥ minimo%` da base (padrão 50).
- A cobertura do grupo conta os produtos já aplicáveis (é a família que importa), mas
  eles não voltam para seleção; até 15 produtos por grupo.
- Sem grupo que passe do mínimo, ainda devolve `totalClientes` (a tela diz "de N clientes,
  nenhum item em X%").

### 3. 3.3 "Popular pelas notas"

Produtos distintos de itens de saída `comodato = true` (CFOP 5908/6908), **produto ativo e
não excluído**, filtráveis por categoria/subcategoria e emissão. Em uma transação:
regera os excluídos (decisão do usuário, 2026-10-07: "quem diz o que é equipamento é o
filtro de categoria, não a exclusão") e insere os que não existem. Devolve `criados`
(novos + regerados) e `existentes`.

### 4. 3.4 Descrição parecida (`descricao-parecida.ts`)

Raízes de 5 letras das palavras da descrição do equipamento, **sem a primeira palavra**
(no cadastro é a marca), sem números e sem raízes genéricas (`DISPE`, `SUPOR`, cores,
materiais, `COMOD`). Conta quantas raízes aparecem na descrição do produto: mais raízes
primeiro — "TOALHA INTERF." casa `TOALH`+`INTER` e passa à frente do "PAPEL HIGIENICO INTER.".

### 5. 3.5 Aplicações pertencem ao produto, não ao equipamento

Excluir o equipamento não apaga as aplicações; recadastrá-lo (manual ou pelo Popular)
traz de volta as que existiam. `produtoId` é `@unique` em `equipamentos_comodato`.

### 6. 3.6 Achados

- 🟡 **Bases diferentes entre as duas ferramentas.** Sugestões usam quem **um dia** recebeu
  o equipamento (inclui quem devolveu em 2015); "itens comuns" usam quem **ainda está** com
  ele. O mesmo equipamento pode ter sugestões puxadas por clientes que já não o têm.
- 🟡 `totalClientes` da listagem/detalhe conta clientes que **algum dia** receberam (sem
  descontar retorno e sem filtrar item `ativo`) — não "clientes com o equipamento hoje".
- 🟡 Em `sugestoes` e `comuns`, a leitura final de produtos (`findMany` por id) não filtra
  `deletedAt`: produto excluído depois da venda pode aparecer como sugestão.
- 🟡 `cli_eq` e `clientesPorProduto` não filtram `ativo` do item; `em_poder` filtra.
- 🟡 `Promise.all` dentro da transação interativa (`findAll`, `findOne`, `comuns`).
- 🟢 O aviso de "equipamento sem consumo em 30 dias" não é deste módulo: mora em
  `clientes/comodato-sql.ts` e usa a relação `aplicacao` cadastrada aqui.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ProdutoRelacionadosService (produtos)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| **Constante Parametrizada `SUGESTAO_MESES`:** janela de compra (sugestões e comuns) | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| **Constante Parametrizada `SUGESTAO_MIN_CLIENTES`:** mínimo de clientes com equipamento que compram | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| **Constante Parametrizada `SUGESTAO_MIN_LIFT`:** quanto acima da taxa geral | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| **Constante Parametrizada `SUGESTAO_CANDIDATOS / SUGESTAO_LIMITE`:** corte antes e depois da descrição parecida | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| **Constante Parametrizada `COMUNS_PRODUTOS_POR_GRUPO`:** produtos mostrados por subcategoria | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| **Constante Parametrizada `minimo (query de comuns)`:** cobertura mínima do grupo | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| **Constante Parametrizada `RAIZES_IGNORADAS, TAMANHO_RAIZ`:** descrição parecida | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| **Constante Parametrizada `Lote de aplicações`:** contrato | `apps/api/src/modules/equipamentos-comodato` | 🟢 |

## Estado Interno e Entidades

- **`EquipamentoComodato`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`ProdutoRelacionado (tipo aplicacao)`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.


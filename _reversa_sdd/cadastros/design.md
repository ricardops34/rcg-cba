# cadastros — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `cadastros`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Submódulo` | `Leitura` | `Escrita pela API` | 200 OK |
| `armazens, condicoes-pagamento, tabelas-preco (+ :id/itens)` | ``visualizar`` | `**nenhuma** (só consulta; entram pelo ERP)` | 200 OK |
| `categorias` | ``visualizar` (aceita também a permissão de 3 relatórios)` | `só `PATCH :id` (`editar`): `usado` e `equipamentoComodato`` | 200 OK |
| `regras-desconto` | ``visualizar`` | `CRUD completo (`cadastrar`/`editar`/`excluir`) com faixas embutidas` | 200 OK |
| `paises, estados, municipios, cnaes, ceps` | ``visualizar`` | `CRUD completo (`cadastrar`/`editar`/`excluir`)` | 200 OK |
| `GET /ceps/consulta/:cep` | `só login` | `autopreenchimento de endereço` | 200 OK |

## Fluxo Principal

### 1. 3.1 Listagens

Padrão único: `where` com `deletedAt: null`, filtros opcionais (`ativo`, e por entidade),
`search` em `contains` sem diferenciar maiúsculas, `sortBy` restrito a uma lista de campos
(`SORT_FIELDS`), `paginationToSkipTake`. Itens de tabela de preço ordenam também por colunas do
produto (`orderBy` aninhado).

### 2. 3.2 Regras de desconto

`validarFaixas`: sequência única e faixas que não se sobrepõem (ordenadas por `percInicial`, cada
`percInicial` precisa ser **maior** que o `percFinal` anterior); o contrato Zod já exige
`percFinal ≥ percInicial`. `garantirPadraoUnico` (a nova regra padrão tira o padrão da anterior) e
`garantirCodigoErpLivre` (409; só confere as não excluídas). No `PATCH`, **enviar `faixas`
substitui o conjunto** (apaga e recria); omitir mantém. Exclusão é soft delete com `padrao = false`.

### 3. 3.3 Categorias

Duas marcações da plataforma, que o ERP **não** sobrescreve (a integração só grava descrição, pai,
regra e `ativo`): `usado` (entra em "Vendas por Categoria" do dashboard; `null` é o estado da
subcategoria) e `equipamentoComodato`, que **desce** para as subcategorias na mesma transação (decisão
de 2026-10-07). Subcategoria nova criada pelo ERP herda a marcação do pai (só na criação).

### 4. 3.4 CEP: cache primeiro, ViaCEP no miss

`consultar`: 8 dígitos (senão 400); procura em `ceps`; no miss chama o ViaCEP (`ExternalHttpService`;
`erro: true` vira 404, queda vira 502), resolve **estado** pela sigla e **município** pelo código IBGE na
referência local, **grava** (`upsert`, `origem = viacep`) e devolve `origem: cache | viacep`. A tela de
cliente usa isso para autopreencher.

### 5. 3.5 CRUDs globais

`create`/`update` fazem `limpar(input)` (texto vazio vira `null`) e gravam com `createdBy`/`updatedBy`;
`remove` é soft delete (`deletedAt`, `ativo = false`).

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ExternalHttpService (ViaCEP)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/cadastros` | 🟢 |

## Estado Interno e Entidades

- **`Categoria`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`CondicaoPagamento`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`Armazem`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`TabelaPreco`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`TabelaPrecoItem`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`RegraDesconto`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`RegraDescontoFaixa`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`Pais`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`Estado`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`Municipio`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`Cep`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`Cnae`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.


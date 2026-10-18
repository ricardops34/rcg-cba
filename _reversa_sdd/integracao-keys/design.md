# integracao-keys — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `integracao-keys`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Rota` | `Permissão` | `Comportamento` | 200 OK |
| `GET /integracao-keys/endpoints` | ``visualizar`` | `catálogo + estado por empresa (sem linha = ativo)` | 200 OK |
| `PATCH /integracao-keys/endpoints/:endpointKey {ativo}` | ``editar`` | `upsert da configuração; 404 se a chave não está no catálogo` | 200 OK |
| `GET /integracao-keys` | ``visualizar`` | `paginada, filtro `ativo` e `search` por nome` | 200 OK |
| `GET /integracao-keys/:id` | ``visualizar`` | `uma chave da empresa` | 200 OK |
| `POST /integracao-keys {nome, expiraEm?}` | ``cadastrar`` | `cria; **devolve a chave em claro uma única vez**` | 200 OK |
| `PATCH /integracao-keys/:id {nome?, ativo?, expiraEm?}` | ``editar`` | `edita/revoga` | 200 OK |
| `DELETE /integracao-keys/:id` | ``excluir`` | `soft delete e `ativo=false`` | 200 OK |

## Fluxo Principal

### 1. 3.1 Emissão da chave

`itg_` + `randomBytes(30)` em base64url (40 caracteres). Guarda só o **SHA-256** em `chaveHash`
(único) e o `prefixo` (12 primeiros caracteres) para identificar na tela e no log. A resposta de
criação é a única em que a chave existe fora do cliente. Não há rotação: perdeu, revoga e cria outra.
Nenhuma leitura devolve `chaveHash` (`SELECT_SEGURO`).

### 2. 3.2 Isolamento

`integracao_api_keys` **não tem RLS** (o `ApiKeyGuard` a consulta antes de existir empresa de
contexto); o filtro `empresaId` em todas as queries do service é a única barreira entre empresas,
e o comentário do arquivo manda nunca removê-lo. Conferido: `findAll`, `findOne`, `update`
(via `findOne`) e `remove` (via `findOne`) filtram sempre.

### 3. 3.3 Revogação

`ativo=false`, `deletedAt` ou `expiraEm` vencido: o `ApiKeyGuard` lê o banco a cada requisição, então
vale **na hora** para as chamadas novas.

### 4. 3.4 Monitor

`listarEndpoints` cruza `CATALOGO_ENDPOINTS_INTEGRACAO` (20 entradas, uma por controller) com
`integracao_endpoint_configs`. `alternarStatus` faz upsert da linha. O `ApiKeyGuard` e as cargas
consultam essa mesma tabela (ver `integracao`, 4.1).

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/integracao-keys` | 🟢 |

## Estado Interno e Entidades

- **`IntegracaoApiKey`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`IntegracaoEndpointConfig`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.


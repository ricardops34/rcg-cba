# API de Integração ERP — guia do desenvolvedor

Documentação da **API pública de integração** (`/api/v1/integracao/...`), a que o
ERP externo consome com chave de API. É o guia para quem vai **consumir** a API
de fora e para quem vai **estendê-la** por dentro — dev humano ou agente de IA.

| Documento | Para quê |
|---|---|
| Este arquivo | Conceitos: autenticação, tenant, upsert, erros, paginação, limites |
| [`endpoints.md`](./endpoints.md) | Referência rota a rota, por entidade, com os fluxos especiais |
| [`swagger.md`](./swagger.md) | Como o Swagger é montado e o padrão obrigatório ao criar endpoint novo |

> **Escopo.** Aqui só a API de integração. As rotas internas do frontend (login,
> permissões, CRM, WhatsApp) **não** são públicas nem documentadas no Swagger —
> ver [`../../AGENTS.md`](../../AGENTS.md) e [`../regras-de-negocio.md`](../regras-de-negocio.md).

> **Atenção ao plano antigo.** [`../planos/api-integracao-erp.md`](../planos/api-integracao-erp.md)
> descreve um desenho **em lote** (`PUT /integracao/<entidade>` com `{ "registros": [...] }`
> e relatório por item) que **não** foi o implementado. O que existe é REST por
> recurso, um registro por chamada. Onde os dois divergirem, vale esta pasta.

---

## Onde a API está

| Ambiente | Base das rotas | Swagger |
|---|---|---|
| Produção | `https://api.rcgcba.bjsoft.com.br/api/v1` | `https://api.rcgcba.bjsoft.com.br/api/docs` |
| Dev local | `http://localhost:3001/api/v1` | `http://localhost:3001/api/docs` |

O prefixo `api` e a versão `v1` são globais (`setGlobalPrefix` +
`enableVersioning` com `defaultVersion: '1'`, em
[`apps/api/src/main.ts`](../../apps/api/src/main.ts)). Um controller declarado
como `@Controller('integracao/produtos')` responde em
`/api/v1/integracao/produtos`. O Swagger é a exceção: fica em `/api/docs`, sem
versão.

---

## Autenticação

Só o header **`x-api-key`**. Não existe login de usuário, JWT ou refresh token
nesta API — os controllers de integração ficam fora do `JwtAuthGuard`.

```bash
curl -H "x-api-key: itg_SEU_TOKEN_AQUI" \
  "https://api.rcgcba.bjsoft.com.br/api/v1/integracao/produtos?page=1&pageSize=50"
```

### Como obter a chave

Na plataforma: **Administração > Integração**. Criar exige a permissão
`integracao.cadastrar`; listar, `integracao.visualizar`.

- Formato: `itg_` seguido de ~40 caracteres aleatórios (`randomBytes(30)` em
  base64url).
- O banco guarda só o **SHA-256** da chave (`chaveHash`) e o **prefixo** de 12
  caracteres, que é o que aparece na tela e nos logs.
- **A chave em claro aparece uma única vez**, na resposta da criação. Perdeu,
  não há como recuperar: revogue e crie outra.
- A chave pode ter `expiraEm`. Revogar é `ativo: false` — vale na hora.

### O que o guard valida

[`ApiKeyGuard`](../../apps/api/src/modules/integracao/guards/api-key.guard.ts)
recusa com **401** quando a chave está ausente, não existe, foi excluída, está
inativa ou expirou. Quando aceita, anexa à requisição o contexto
`{ empresaId, apiKeyId }` e atualiza `ultimoUso` (no máximo 1×/min por chave,
para não gerar um UPDATE por requisição).

---

## Empresa (multi-tenant)

**A chave carrega a empresa.** Nenhuma rota recebe `empresaId` por parâmetro:
ele sai da chave, e todo acesso roda dentro de `withTenant(empresaId, ...)`, com
Row-Level Security no Postgres. Uma chave nunca enxerga dados de outra empresa,
mesmo que o código da aplicação errasse o `WHERE`.

Empresa nova = chave nova. A mesma chave não serve para duas empresas.

---

## Convenções de todas as entidades

### Chave natural — o ERP manda no identificador

A plataforma tem `id` UUID próprio, mas a integração **não** trabalha com ele (a
única exceção é `PATCH /integracao/orcamentos/pendentes/{id}`, explicada em
[`endpoints.md`](./endpoints.md)). O que identifica um registro é o código do
ERP, único por empresa:

| Tipo de entidade | Chave | Formato |
|---|---|---|
| Cadastros (produto, cliente, vendedor, categoria, armazém, condição de pagamento, tabela de preço, regra de desconto) | `codigoErp` | string, até 30 chars |
| Transacionais (nota de saída, título a receber, objetivo, orçamento) | `codigoLegado` | inteiro (id da linha no ERP) |
| Estoque | `produtoCodigo` + `armazemCodigo` | par de strings |

Referências entre entidades também são por código, nunca por UUID:
`categoriaCodigo`, `vendedorCodigo`, `clienteCodigo`, `produtoCodigo`… O
registro referenciado **precisa já existir** — daí a [ordem de carga](#ordem-de-carga).

### Verbos

| Verbo | Rota | Semântica |
|---|---|---|
| `GET` | `/integracao/<entidade>` | Lista paginada |
| `GET` | `/integracao/<entidade>/{codigo}` | Detalhe; **404** se não existir |
| `POST` | `/integracao/<entidade>` | Cria; **409** se o código já existir ativo |
| `PATCH` | `/integracao/<entidade>/{codigo}` | Atualização **parcial**; **404** se não existir |
| `DELETE` | `/integracao/<entidade>/{codigo}` | **Soft delete** (marca `deletedAt`) |

Não há `PUT`, e não há endpoint de lote: uma chamada, um registro.

### Exclusão é soft, e POST ressuscita

`DELETE` nunca apaga a linha — grava `deletedAt`/`deletedBy`. A partir daí o
registro some das listagens e dos detalhes (todo `WHERE` filtra
`deletedAt: null`).

Se o ERP reenviar por `POST` um código que está excluído, o registro **volta**,
com os dados do payload novo (ver
[`reativar-excluido.ts`](../../apps/api/src/modules/integracao/common/reativar-excluido.ts)):

- código não existe → cria (`201`);
- código existe e está **ativo** → **409** (use `PATCH`);
- código existe e está **excluído** → reativa, gravando os dados enviados agora.

Sem isso, o código de um registro excluído viraria um beco sem saída: o `POST`
recusaria por duplicidade e o `PATCH` não encontraria nada.

### Auditoria

Tudo que a integração grava recebe `createdBy`/`updatedBy` no formato
**`integracao:<apiKeyId>`** — dá para rastrear qual chave escreveu cada linha.
As respostas trazem `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.

### Datas e números

- Datas: ISO 8601 na entrada (`"2026-08-26T00:00:00.000Z"` ou `"2026-08-26"`) e
  na saída. Campos opcionais aceitam `null`.
- Decimais: número JSON, não string (`"valor": 1234.56`).
- Booleanos em filtro de query: `?ativo=true` / `?ativo=false`.

---

## Paginação

Todo `GET` de lista aceita:

| Query | Padrão | Observação |
|---|---|---|
| `page` | `1` | começa em 1 |
| `pageSize` | `20` | **máximo 100** |
| `search` | — | busca textual no campo descritivo da entidade |
| `sortBy` / `sortOrder` | — | `asc` \| `desc` |

Além desses, cada entidade tem os seus filtros (`ativo`, `status`, `semXml`…) —
ver [`endpoints.md`](./endpoints.md).

Resposta:

```json
{
  "data": [ { "id": "…", "codigoErp": "11400443" } ],
  "total": 1342,
  "page": 1,
  "pageSize": 20,
  "totalPages": 68
}
```

---

## Erros

Formato único, de
[`AllExceptionsFilter`](../../apps/api/src/common/filters/http-exception.filter.ts):

```json
{ "code": "NOT_FOUND", "message": "Produto não encontrado" }
```

Erro de validação (Zod) vem com o detalhamento campo a campo:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Dados inválidos",
  "details": [
    { "path": "itens.0.produtoCodigo", "message": "Required" }
  ]
}
```

| Status | Quando |
|---|---|
| `400` | Payload inválido (`VALIDATION_ERROR`) |
| `401` | Chave ausente, inválida, revogada ou expirada |
| `404` | Código não encontrado (ou já excluído) — **inclusive um código referenciado no payload**: `produtoCodigo 'X' não encontrado` |
| `409` | Código já existe ativo, ou regra de negócio violada (orçamento já vinculado, XML com chave divergente da nota) |
| `429` | Limite de requisições excedido |
| `500` | Erro interno (`INTERNAL_ERROR`) — o detalhe fica no log do servidor |

---

## Limite de requisições

| Escopo | Limite |
|---|---|
| Global (toda a API) | 200 req/min |
| Rotas de integração | 60 req/min |
| Envio de XML de NF-e | 120 req/min |

Contados pelo `ThrottlerGuard` padrão do Nest, que rastreia **por IP de
origem** — não por chave de API. Duas chaves saindo do mesmo IP dividem o mesmo
balde. Ao estourar, a resposta é `429`; o cliente deve esperar e repetir.

---

## Ordem de carga

Como as referências são por código e o alvo precisa existir, uma carga do zero
segue esta ordem:

```text
regras-desconto
  └── categorias            (categoria pai antes da subcategoria)
condicoes-pagamento
armazens
  └── produtos              (categoria, subcategoria, armazém)
vendedores
  └── clientes              (vendedor, tabela de preço, condição de pagamento)
tabelas-preco               (itens referenciam produtos)
estoque                     (produto + armazém)
objetivos                   (vendedor)
notas-saida                 (cliente, vendedor, condição; itens → produtos)
titulos-receber             (cliente, vendedor)
orcamentos                  (cliente, vendedor, condição; itens → produtos)
```

Na sincronização do dia a dia a ordem só importa dentro de cada dependência —
produto novo antes do saldo de estoque dele, por exemplo.

---

## Mapa do código

| O quê | Onde |
|---|---|
| Controllers e services por entidade | [`apps/api/src/modules/integracao/`](../../apps/api/src/modules/integracao/) |
| Guard da chave de API | [`integracao/guards/api-key.guard.ts`](../../apps/api/src/modules/integracao/guards/api-key.guard.ts) |
| `@CurrentIntegracao()` | [`integracao/decorators/current-integracao.decorator.ts`](../../apps/api/src/modules/integracao/decorators/current-integracao.decorator.ts) |
| Reativação de excluído, autor de auditoria | [`integracao/common/`](../../apps/api/src/modules/integracao/common/) |
| Schemas, tipos e exemplos (fonte única) | [`packages/contracts/src/integracao.ts`](../../packages/contracts/src/integracao.ts) |
| Gestão de chaves (rotas internas, com JWT) | [`apps/api/src/modules/integracao-keys/`](../../apps/api/src/modules/integracao-keys/) |
| Bootstrap do Swagger | [`apps/api/src/main.ts`](../../apps/api/src/main.ts) |

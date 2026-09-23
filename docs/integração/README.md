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

### Chave de integração — o ERP manda no identificador

A plataforma tem `id` UUID próprio, mas a integração **não** trabalha com ele (a
única exceção é `PATCH /integracao/orcamentos/pendentes/{id}`, explicada em
[`endpoints.md`](./endpoints.md)). Todo registro tem dois campos, independentes
— um nunca é calculado a partir do outro (plano
[`2026-09-22-chave-integracao.md`](../planos/2026-09-22-chave-integracao.md)):

| Campo | O que é | Tela |
|---|---|---|
| `chave` | **Chave de integração**: a chave única da tabela no Protheus (X2_UNICO), com `-` entre os campos, na mesma ordem. É por ela que a API cadastra, atualiza, exclui e liga os registros. Única por empresa — nos itens, única dentro do cabeçalho | "Integração" |
| `codigoErp` | Código no ERP, **só informativo**. Opcional; sem ele o campo fica vazio. Existe nos cadastros e cabeçalhos — itens não têm | "Código" |

Exemplos: categoria `chave` `-12` (tabela compartilhada: filial em branco) e
`codigoErp` `12`; cliente `01-000001-01` e `00000101`; estoque
`01-11400443-01` (`B2_FILIAL-B2_COD-B2_LOCAL`) e `11400443`. A tabela completa
de chaves, tabela por tabela, está no plano.

A `chave` é **opaca para a plataforma**: quem escolhe o que vai nela é o ERP. A
API não interpreta, não monta e não valida formato — guarda, indexa e compara.
A validação é só tamanho (até 60) e não-vazio.

Referências entre entidades também são pela chave, nunca por UUID:
`categoriaChave`, `vendedorChave`, `clienteChave`, `produtoChave`… O
registro referenciado **precisa já existir** — daí a [ordem de carga](#ordem-de-carga).

### Verbos

| Verbo | Rota | Semântica |
|---|---|---|
| `GET` | `/integracao/<entidade>` | Lista paginada |
| `GET` | `/integracao/<entidade>/{codigo}` | Detalhe; **404** se não existir |
| `POST` | `/integracao/<entidade>` | **Upsert** por `chave`: cria ou atualiza, `201` nos dois casos |
| `PATCH` | `/integracao/<entidade>/{codigo}` | Atualização **parcial**; **404** se não existir |
| `DELETE` | `/integracao/<entidade>/{codigo}` | **Soft delete idempotente** por `chave` (marca `deletedAt`); se não existir, também retorna sucesso |

Não há `PUT`, e não há endpoint de lote: uma chamada, um registro.

### POST é upsert

O ERP não tem como saber se um registro já subiu — ele manda o que mudou, e é a
plataforma que reconhece. Todo `POST` procura a `chave` na empresa da chave,
**inclusive entre os excluídos**, e decide (ver
[`decidir-upsert.ts`](../../apps/api/src/modules/integracao/common/decidir-upsert.ts)):

- código não existe → **cria**;
- código existe e está **ativo** → **atualiza** com o payload inteiro;
- código existe e está **excluído** → atualiza **e** limpa `deletedAt`.

Nos três casos a resposta é `201` com o registro gravado — o ERP não precisa
distinguir criação de atualização, e o corpo devolve o estado final de qualquer
jeito. Reenviar o mesmo payload duas vezes dá o mesmo resultado e nenhuma linha
nova.

Não existe `409` por duplicidade. A versão anterior recusava o `POST` de um
código ativo e mandava usar `PATCH` — o que custava duas requisições para cada
registro alterado, contra um teto de 60 req/min por IP, e deixava o código de um
registro excluído num beco sem saída: o `POST` recusava contando o soft-deletado
e o `PATCH` não achava nada, porque filtra `deletedAt: null`.

`DELETE` nunca apaga a linha — grava `deletedAt`/`deletedBy`. A partir daí o
registro some das listagens e dos detalhes (todo `WHERE` filtra
`deletedAt: null`), até que o ERP o reenvie.

Repetir o mesmo `DELETE` é seguro: registro inexistente ou já excluído retorna
sucesso, sem `404`. A mesma regra vale para itens de lote com `excluido: true`,
permitindo reprocessar uma carga sem transformar uma exclusão já aplicada em erro.

### Mestre-detalhe: cabeçalho e itens sempre juntos

Nas entidades com coleção aninhada — itens da nota, itens do orçamento, itens da
tabela de preço, metas por categoria —, cabeçalho e itens vão **sempre juntos**,
no mesmo envio. Não existe rota de item avulso. O item fica ligado ao cabeçalho
pelo vínculo interno da plataforma e é casado pela sua `chave` **dentro do
cabeçalho**: criado se é novo, atualizado se já existe.

**Filho ausente do payload não é excluído.** O ERP lê os itens sem filtrar
`D_E_L_E_T_`: o item excluído vem no envio com `"delete": true`, e é assim — e
só assim — que ele sai (ver
[`sincronizar-filhos.ts`](../../apps/api/src/modules/integracao/common/sincronizar-filhos.ts)).

Apagar e recriar o conjunto daria o mesmo conteúdo final, mas trocaria o uuid de
todos os itens a cada envio, mesmo quando só um preço mudou.

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
  "data": [ { "id": "…", "chave": "11400443" } ],
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
    { "path": "itens.0.produtoChave", "message": "Required" }
  ]
}
```

| Status | Quando |
|---|---|
| `400` | Payload inválido (`VALIDATION_ERROR`) |
| `401` | Chave ausente, inválida, revogada ou expirada |
| `404` | Código não encontrado (ou já excluído) — **inclusive um código referenciado no payload**: `produtoChave 'X' não encontrado` |
| `409` | Regra de negócio violada: orçamento já vinculado, XML com chave divergente da nota. **Não** é mais devolvido por código duplicado — `POST` é upsert |
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
fornecedores
tabelas-preco               (itens referenciam produtos)
estoque                     (produto + armazém)
objetivos                   (vendedor)
notas-saida                 (cliente, vendedor, condição; itens → produtos)
notas-entrada               (fornecedor OU cliente, condição; itens → produtos, armazéns)
titulos-receber             (cliente, vendedor)
orcamentos                  (cliente, vendedor, condição; itens → produtos)
```

`notas-entrada` depende de **fornecedores e clientes**: a SF1 guarda os dois
documentos, e o participante muda com o tipo — compra (`'N'`) aponta para um
fornecedor, devolução de venda (`'D'`) aponta para um cliente.

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

# API de Integração ERP — referência de endpoints

Todas as rotas abaixo são relativas à base `/api/v1` e exigem o header
`x-api-key`. Os conceitos comuns (autenticação, paginação, erros, soft delete,
reativação por `POST`) estão no [`README.md`](./README.md) — aqui está o que
muda de entidade para entidade.

O **detalhe campo a campo** (tipos, tamanhos, obrigatoriedade, exemplos de
payload) é gerado a partir do código e vive no Swagger: `/api/docs`. Os schemas
que o geram estão em
[`packages/contracts/src/integracao.ts`](../../packages/contracts/src/integracao.ts).

---

## Visão geral

Todas seguem o mesmo CRUD — `GET` lista, `GET /{codigo}`, `POST`,
`PATCH /{codigo}`, `DELETE /{codigo}`. Estoque troca `{codigo}` por
`{produtoCodigo}/{armazemCodigo}`; notas de saída e orçamentos têm rotas extras
além do CRUD.

| Recurso | Chave | Filtros próprios | Particularidade |
|---|---|---|---|
| `/integracao/regras-desconto` | `codigoErp` | `ativo` | — |
| `/integracao/categorias` | `codigoErp` | `ativo` | hierárquica (`categoriaPaiCodigo`) |
| `/integracao/condicoes-pagamento` | `codigoErp` | `ativo` | — |
| `/integracao/armazens` | `codigoErp` | `ativo` | — |
| `/integracao/produtos` | `codigoErp` | `ativo` | — |
| `/integracao/vendedores` | `codigoErp` | `ativo` | — |
| `/integracao/clientes` | `codigoErp` | `ativo` | **`PATCH` vai para fila de aprovação** |
| `/integracao/tabelas-preco` | `codigoErp` | `ativo` | mestre-detalhe (`itens`) |
| `/integracao/estoque` | `produtoCodigo` + `armazemCodigo` | `produtoCodigo`, `armazemCodigo` | chave composta na URL |
| `/integracao/objetivos` | `codigoLegado` | `ativo`, `ano`, `mes` | mestre-detalhe (`categorias`) |
| `/integracao/notas-saida` | `codigoLegado` | `ativo`, `semXml` | mestre-detalhe (`itens`) + rotas de XML |
| `/integracao/titulos-receber` | `codigoLegado` | `ativo` | campos de cobrança bancária |
| `/integracao/orcamentos` | `codigoLegado` | `ativo`, `status` | mestre-detalhe (`itens`) + fila de pendentes |

Todos os `GET` de lista aceitam ainda `page`, `pageSize`, `search`, `sortBy` e
`sortOrder`.

---

## Cadastros

### Regras de desconto — `/integracao/regras-desconto`

Base dos percentuais de desconto usados por categoria, produto, tabela de preço
e item de orçamento (`Z0_CODIGO` da SZ0 no ERP). Carregue **antes** das
categorias e dos produtos.

Campos principais: `codigoErp`, `descricao`, `percDescontoAutorizado`,
`percDescontoMaximo`, `ativo`.

### Categorias — `/integracao/categorias`

Hierarquia de duas pontas no mesmo recurso: uma subcategoria é uma categoria com
`categoriaPaiCodigo` preenchido. **A pai precisa existir antes da filha.**

```json
{
  "codigoErp": "000004",
  "descricao": "COZINHA",
  "categoriaPaiCodigo": null,
  "regraDescontoCodigo": null,
  "ativo": true
}
```

### Condições de pagamento — `/integracao/condicoes-pagamento`

Referenciada por cliente, nota de saída e orçamento (`condicaoCodigo` /
`condicaoPagamentoCodigo`).

### Armazéns — `/integracao/armazens`

Referenciado pelo produto (`armazemCodigo`, armazém padrão) e pelo saldo de
estoque.

### Produtos — `/integracao/produtos`

```json
{
  "codigoErp": "11400443",
  "descricao": "DETERGENTE NEUTRO 5L",
  "unidade": "GL",
  "categoriaCodigo": "000004",
  "subCategoriaCodigo": null,
  "armazemCodigo": "001",
  "ativo": true
}
```

`categoriaCodigo`, `subCategoriaCodigo`, `armazemCodigo` e
`regraDescontoCodigo` apontam para o `codigoErp` do respectivo cadastro, que
precisa já existir. Demais campos: `marca`, `codigoBarras`, `ncm`,
`codigoFornecedor`, `qtdEmbalagem`, `peso`, `ultimoPreco`, `observacao`.

### Vendedores — `/integracao/vendedores`

Chave `codigoErp`. É o alvo de `vendedorCodigo` em clientes, notas, títulos,
objetivos e orçamentos.

### Tabelas de preço — `/integracao/tabelas-preco`

Mestre-detalhe. `GET /{codigo}` devolve a tabela **com os itens**.

```json
{
  "codigoErp": "001",
  "descricao": "TABELA PADRAO",
  "dtInicio": "2019-07-11T00:00:00.000Z",
  "dtFim": null,
  "ativo": true,
  "itens": [
    { "produtoCodigo": "11400443", "preco": 89.9, "regraDescontoCodigo": null, "ativo": true }
  ]
}
```

> **`itens` substitui o conjunto inteiro a cada `PATCH`.** Não é uma lista
> incremental: o que não vier no array é removido. Para mexer em um preço,
> reenvie a tabela completa.

### Estoque — `/integracao/estoque`

Chave composta, refletida na URL:

```
GET    /integracao/estoque/{produtoCodigo}/{armazemCodigo}
PATCH  /integracao/estoque/{produtoCodigo}/{armazemCodigo}
DELETE /integracao/estoque/{produtoCodigo}/{armazemCodigo}
```

A listagem filtra por `produtoCodigo` e/ou `armazemCodigo`
(`GET /integracao/estoque?produtoCodigo=11400443`). Produto e armazém precisam
existir.

```json
{ "produtoCodigo": "11400443", "armazemCodigo": "001", "saldo": 128 }
```

---

## Clientes — `/integracao/clientes`

Chave `codigoErp`. Payload plano com o cadastro comercial completo: dados
fiscais (`tipoPessoa`, `cnpjCpf`, `inscricaoEstadual`, `contribuinteIcms`),
contato, endereço (com `latitude`/`longitude`), `limiteCredito` e
`vencimentoLimite`. Referencia `vendedorCodigo`, `tabelaPrecoCodigo` e
`condicaoPagamentoCodigo`.

### `POST` grava; `PATCH` **não** grava direto

Esta é a diferença que mais surpreende quem integra:

- **`POST`** (cliente novo) cria o cadastro normalmente e devolve o cliente.
- **`PATCH`** (cliente existente) **não altera o cadastro**: a mudança entra na
  **fila de aprovação interna** da plataforma, a mesma que a tela usa. Alguém com
  permissão aprova ou recusa em *Cadastros > Alterações de Cliente*.

Por quê: não há usuário por trás da chamada do ERP para responder pela mudança,
e o cadastro comercial é editado também pelo time interno — aplicar direto
apagaria em silêncio o trabalho de quem edita pela tela.

Resposta do `PATCH`:

```json
{
  "cliente": { "codigoErp": "004417", "razaoSocial": "MERCADO ANDRADE LTDA" },
  "pendente": true,
  "camposPendentes": ["telefone", "vendedorCodigo"]
}
```

- `cliente` é o cadastro **como está agora** — ainda sem as mudanças enviadas.
- `pendente` diz se ficou algo aguardando aprovação.
- `camposPendentes` lista o que difere do que já estava gravado.

Reenviar o mesmo payload é inofensivo: o diff sai vazio, `pendente` volta
`false` e nada é enfileirado. Uma integração que roda de hora em hora pode
mandar tudo sempre, sem inundar a fila.

---

## Transacionais

### Objetivos — `/integracao/objetivos`

Metas por vendedor/mês/ano. Chave `codigoLegado` (id da linha no ERP — vendedor,
mês e ano juntos não são únicos o bastante). Filtros extras: `ano`, `mes`.

```json
{
  "codigoLegado": 5821,
  "vendedorCodigo": "000234",
  "mes": 8,
  "ano": 2026,
  "valor": 250000,
  "categorias": [ { "categoriaCodigo": "000004", "valor": 80000 } ]
}
```

`categorias` (metas por categoria) segue a mesma regra dos outros
mestre-detalhe: **substitui o conjunto inteiro a cada `PATCH`**.

### Notas de saída — `/integracao/notas-saida`

Chave `codigoLegado`. Cabeçalho + `itens` (cada item com o próprio
`codigoLegado`, o id da linha no ERP). `clienteId`, `vendedorId` e `dtEmissao`
dos itens são preenchidos pelo service a partir do cabeçalho — não vêm no
payload do item.

`itens` **substitui o conjunto inteiro a cada `PATCH`**.

Filtro `semXml=true` lista as notas que ainda não têm XML autorizado na
plataforma — é assim que o ERP descobre o que falta enviar numa carga
retroativa, sem perguntar nota a nota.

#### XML da NF-e (2ª via do DANFE)

```
POST   /integracao/notas-saida/{codigoLegado}/xml
GET    /integracao/notas-saida/{codigoLegado}/xml[?conteudo=true]
DELETE /integracao/notas-saida/{codigoLegado}/xml
```

No `POST`, envie **`xml`** (texto) **ou** `xmlBase64` — exatamente um dos dois
(mandar os dois é `400`; com ambos preenchidos não haveria como saber qual é o
arquivo verdadeiro). O `xmlBase64` existe para ERP que não escapa texto em JSON.

A plataforma extrai chave, protocolo, número, série e situação do próprio
arquivo e recusa com **409** um XML que não seja NF-e ou cuja chave não confira
com a da nota. Reenviar substitui o XML anterior.

```json
{
  "codigoLegado": 45012,
  "chaveNfe": "50260600000000000191550010001160671000116060",
  "numero": "116067",
  "serie": "1",
  "protocolo": "150260000000000",
  "situacao": "autorizada",
  "recebidoEm": "2026-08-26T12:00:00.000Z"
}
```

O `GET` por padrão devolve só a situação (chegou? quando? que tamanho?);
`?conteudo=true` traz o arquivo. O `DELETE` existe para o caso de o arquivo ter
ido no `codigoLegado` errado: limpa protocolo e situação, e a 2ª via deixa de
ser oferecida. A nota em si não é tocada.

Limite próprio de 120 req/min nesta rota — uma carga retroativa de milhares de
arquivos não divide o balde com o cadastro.

### Títulos a receber — `/integracao/titulos-receber`

Chave `codigoLegado`. Além do financeiro básico (`numero`, `parcela`,
`prefixo`, `emissao`, `vencimento`, `vencimentoReal`, `valor`, `saldo`,
`acrescimo`, `decrescimo`, `dtBaixa`, `formaPgto`, `historico`), carrega os
campos de **cobrança bancária** que a 2ª via de boleto usa (`nossoNumero` e
companhia) — todos opcionais, porque título pago em dinheiro, depósito ou PIX
não tem boleto.

---

## Orçamentos — `/integracao/orcamentos`

Chave `codigoLegado`. `status`: `rascunho`, `enviado`, `aprovado`, `recusado`,
`expirado`. `itens` **substitui o conjunto inteiro a cada `PATCH`**.

O orçamento é a única entidade que anda **nos dois sentidos**: o ERP empurra os
dele, e a plataforma produz orçamentos próprios (feitos pelo vendedor na tela)
que o ERP precisa puxar.

### O sentido plataforma → ERP

```
GET   /integracao/orcamentos/pendentes
PATCH /integracao/orcamentos/pendentes/{id}
```

1. `GET .../pendentes` lista os orçamentos **aprovados** criados na plataforma
   que ainda não têm `codigoLegado` — prontos para o ERP importar.
2. O ERP importa e gera o número dele.
3. `PATCH .../pendentes/{id}` grava esse número:

   ```json
   { "codigoLegado": 90231 }
   ```

   Aqui — e só aqui — o `{id}` é o **id interno da plataforma** (UUID), o mesmo
   que veio no `GET .../pendentes`; ainda não existe código do ERP para usar.

4. A partir daí o orçamento passa a aparecer no `GET /integracao/orcamentos`
   normal, como qualquer outro.

O vínculo só pode ser feito **uma vez**. Retorna `409` se o orçamento já estiver
vinculado, se ainda não estiver aprovado, ou se o `codigoLegado` colidir com o de
outro orçamento.

> `GET /integracao/orcamentos` lista **só** os que já têm `codigoLegado`. Quem
> procura orçamento da plataforma ali não acha nada: eles estão em
> `.../pendentes` até serem vinculados.

---

## Gestão de chaves (rotas internas)

Não fazem parte da API pública — usam **JWT + permissão**, não `x-api-key`, e
não aparecem no Swagger. São o que a tela *Administração > Integração* consome:

| Rota | Permissão |
|---|---|
| `GET /integracao-keys` | `integracao.visualizar` |
| `GET /integracao-keys/{id}` | `integracao.visualizar` |
| `POST /integracao-keys` | `integracao.cadastrar` |
| `PATCH /integracao-keys/{id}` | `integracao.editar` |
| `DELETE /integracao-keys/{id}` | `integracao.excluir` |

A resposta do `POST` é a **única** vez que a chave em claro aparece. O `PATCH`
com `ativo: false` revoga na hora.

---

## Receitas rápidas

```bash
API="https://api.rcgcba.bjsoft.com.br/api/v1"
KEY="itg_SEU_TOKEN_AQUI"

# Criar um produto
curl -X POST "$API/integracao/produtos" \
  -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"codigoErp":"11400443","descricao":"DETERGENTE NEUTRO 5L","unidade":"GL","categoriaCodigo":"000004"}'

# Atualizar só o preço de referência (parcial)
curl -X PATCH "$API/integracao/produtos/11400443" \
  -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"ultimoPreco":92.5}'

# Atualizar saldo de estoque
curl -X PATCH "$API/integracao/estoque/11400443/001" \
  -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"saldo":128}'

# Descobrir notas sem XML e enviar o de uma delas
curl "$API/integracao/notas-saida?semXml=true&pageSize=100" -H "x-api-key: $KEY"
curl -X POST "$API/integracao/notas-saida/45012/xml" \
  -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"xmlBase64":"PD94bWwgdmVyc2lvbj0iMS4wIi8+"}'

# Puxar orçamentos aprovados na plataforma e vincular ao número do ERP
curl "$API/integracao/orcamentos/pendentes" -H "x-api-key: $KEY"
curl -X PATCH "$API/integracao/orcamentos/pendentes/8b9c0d1e-2f3a-4b4c-5d6e-7f8091a2b3c4" \
  -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"codigoLegado":90231}'
```

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
`{produtoChave}/{armazemChave}`; notas de saída e orçamentos têm rotas extras
além do CRUD. Todas aceitam também `PUT` na raiz do recurso, que aplica
até 1.000 registros de uma vez — ver [Lote](#lote--put-integracaoentidade).

| Recurso | Chave | Filtros próprios | Particularidade |
|---|---|---|---|
| `/integracao/regras-desconto` | `chave` | `ativo` | — |
| `/integracao/categorias` | `chave` | `ativo` | hierárquica (`categoriaPaiChave`) |
| `/integracao/condicoes-pagamento` | `chave` | `ativo` | — |
| `/integracao/armazens` | `chave` | `ativo` | — |
| `/integracao/produtos` | `chave` | `ativo` | — |
| `/integracao/vendedores` | `chave` | `ativo` | — |
| `/integracao/fornecedores` | `chave` | `ativo` | — |
| `/integracao/clientes` | `chave` | `ativo` | **`PATCH` vai para fila de aprovação** |
| `/integracao/tabelas-preco` | `chave` | `ativo` | mestre-detalhe (`itens`) |
| `/integracao/estoque` | `chave` | `chave`, `produtoChave`, `armazemChave` | `B2_FILIAL-B2_COD-B2_LOCAL` |
| `/integracao/objetivos` | `chave` | `ativo`, `ano`, `mes` | mestre-detalhe (`categorias`) |
| `/integracao/notas-saida` | `chave` | `ativo`, `semXml` | mestre-detalhe (`itens`) + rotas de XML |
| `/integracao/notas-entrada` | `chave` | `ativo`, `tipo`, `fornecedorChave`, `clienteChave` | mestre-detalhe (`itens`) + `tipo` decide o participante |
| `/integracao/titulos-receber` | `chave` | `ativo` | campos de cobrança bancária |
| `/integracao/orcamentos` | `chave` | `ativo`, `status` | mestre-detalhe (`itens`) + fila de pendentes |

Todos os `GET` de lista aceitam ainda `page`, `pageSize`, `search`, `sortBy` e
`sortOrder`.

---

## Cadastros

### Regras de desconto — `/integracao/regras-desconto`

Base dos percentuais de desconto usados por categoria, produto, tabela de preço
e item de orçamento (`Z0_CODIGO` da SZ0 no ERP). Carregue **antes** das
categorias e dos produtos.

Campos principais: `chave`, `descricao`, `percDescontoAutorizado`,
`percDescontoMaximo`, `ativo`.

### Categorias — `/integracao/categorias`

Hierarquia de duas pontas no mesmo recurso: uma subcategoria é uma categoria com
`categoriaPaiChave` preenchido. **A pai precisa existir antes da filha.**

```json
{
  "chave": "01-000004",
  "codigoErp": "000004",
  "descricao": "COZINHA",
  "categoriaPaiChave": null,
  "regraDescontoChave": null,
  "ativo": true
}
```

### Condições de pagamento — `/integracao/condicoes-pagamento`

Referenciada por cliente, nota de saída e orçamento (`condicaoChave` /
`condicaoPagamentoChave`).

### Armazéns — `/integracao/armazens`

Referenciado pelo produto (`armazemChave`, armazém padrão) e pelo saldo de
estoque.

### Produtos — `/integracao/produtos`

```json
{
  "chave": "01-11400443",
  "codigoErp": "11400443",
  "descricao": "DETERGENTE NEUTRO 5L",
  "unidade": "GL",
  "categoriaChave": "01-000004",
  "subCategoriaChave": null,
  "armazemChave": "01-01",
  "ativo": true
}
```

`categoriaChave`, `subCategoriaChave`, `armazemChave` e
`regraDescontoChave` apontam para a `chave` do respectivo cadastro, que
precisa já existir. Demais campos: `marca`, `codigoBarras`, `ncm`,
`codigoFornecedor`, `qtdEmbalagem`, `peso`, `ultimoPreco`, `observacao`.

### Vendedores — `/integracao/vendedores`

Chave `chave`. É o alvo de `vendedorChave` em clientes, notas, títulos,
objetivos e orçamentos.

### Fornecedores — `/integracao/fornecedores`

Chave `chave`. É o alvo de `fornecedorChave` nas notas de entrada —
carregue **antes** delas.

Cadastro enxuto, sem nada de carteira ou crédito: identificação (`tipoPessoa`,
`razaoSocial`, `nomeFantasia`, `cnpjCpf`, inscrições), contato (`contato`,
`email`, `telefone`, `celular`), endereço (`endereco`, `complemento`, `bairro`,
`municipio`, `uf`, `cep`), `observacao` e `ativo`.

Não confundir com `produtos.codigoFornecedor`, que é o código do item no
catálogo do fornecedor e continua sendo texto solto — não aponta para cá.

### Tabelas de preço — `/integracao/tabelas-preco`

Mestre-detalhe. `GET /{codigo}` devolve a tabela **com os itens**.

```json
{
  "chave": "01-001",
  "codigoErp": "001",
  "descricao": "TABELA PADRAO",
  "dtInicio": "2019-07-11T00:00:00.000Z",
  "dtFim": null,
  "ativo": true,
  "itens": [
    { "chave": "01-001-11400443-0001", "produtoChave": "01-11400443", "preco": 89.9, "regraDescontoChave": null, "ativo": true }
  ]
}
```

> **`itens` substitui o conjunto inteiro.** Não é uma lista incremental: o que
> não vier no array é removido, e o que vier é casado pela `chave` do item.
> Para mexer em um preço, reenvie a tabela completa.

### Estoque — `/integracao/estoque`

Chave composta, refletida na URL:

```
GET    /integracao/estoque/{chave}
PATCH  /integracao/estoque/{chave}
DELETE /integracao/estoque/{chave}
```

A listagem filtra por `produtoChave` e/ou `armazemChave`
(`GET /integracao/estoque?produtoChave=01-11400443`). Produto e armazém precisam
existir.

```json
{ "chave": "01-11400443-01", "codigoErp": "11400443", "produtoChave": "01-11400443", "armazemChave": "01-01", "saldo": 128 }
```

---

## Clientes — `/integracao/clientes`

Chave `chave`. Payload plano com o cadastro comercial completo: dados
fiscais (`tipoPessoa`, `cnpjCpf`, `inscricaoEstadual`, `contribuinteIcms`),
contato, endereço (com `latitude`/`longitude`), `limiteCredito` e
`vencimentoLimite`. Referencia `vendedorChave`, `tabelaPrecoChave` e
`condicaoPagamentoChave`.

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
  "cliente": { "chave": "01-004417-01", "codigoErp": "00441701", "razaoSocial": "MERCADO ANDRADE LTDA" },
  "pendente": true,
  "camposPendentes": ["telefone", "vendedorChave"]
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

Metas por vendedor/mês/ano. Chave `chave` — o valor que o ERP escolheu
para identificar a meta. Filtros extras: `ano`, `mes`.

```json
{
  "chave": "01-000234-2026-08",
  "vendedorChave": "01-000234",
  "mes": 8,
  "ano": 2026,
  "valor": 250000,
  "categorias": [ { "chave": "01-000234-2026-08-000004", "categoriaChave": "01-000004", "valor": 80000 } ]
}
```

`categorias` (metas por categoria) segue a mesma regra dos outros
mestre-detalhe: **substitui o conjunto inteiro**, casando cada linha pelo
`chave` dela.

### Notas de saída — `/integracao/notas-saida`

Chave `chave`
(`F2_FILIAL`-`F2_DOC`-`F2_SERIE`-`F2_CLIENTE`-`F2_LOJA`-`F2_FORMUL`-`F2_TIPO`),
`codigoErp` = `F2_DOC`. Cabeçalho + `itens`, sempre juntos; cada item com a
própria `chave` (`D2_FILIAL`-`D2_DOC`-`D2_SERIE`-`D2_CLIENTE`-`D2_LOJA`-`D2_COD`-`D2_ITEM`)
e sem `codigoErp`. `clienteId`, `vendedorId` e `dtEmissao`
dos itens são preenchidos pelo service a partir do cabeçalho — não vêm no
payload do item.

Cada item é casado pela `chave` **dentro da nota**. Item com `delete: true` é
removido; item ausente do payload **não** é excluído — o ERP manda os itens sem
filtrar `D_E_L_E_T_`, então o excluído chega marcado.

Filtro `semXml=true` lista as notas que ainda não têm XML autorizado na
plataforma — é assim que o ERP descobre o que falta enviar numa carga
retroativa, sem perguntar nota a nota.

#### XML da NF-e (2ª via do DANFE)

```
POST   /integracao/notas-saida/{chave}/xml
GET    /integracao/notas-saida/{chave}/xml[?conteudo=true]
DELETE /integracao/notas-saida/{chave}/xml
```

No `POST`, envie **`xml`** (texto) **ou** `xmlBase64` — exatamente um dos dois
(mandar os dois é `400`; com ambos preenchidos não haveria como saber qual é o
arquivo verdadeiro). O `xmlBase64` existe para ERP que não escapa texto em JSON.

A plataforma extrai chave, protocolo, número, série e situação do próprio
arquivo e recusa com **409** um XML que não seja NF-e ou cuja chave não confira
com a da nota. Reenviar substitui o XML anterior.

```json
{
  "chave": "01-000116067-1  -004417-01-N-N",
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
ido na `chave` errado: limpa protocolo e situação, e a 2ª via deixa de
ser oferecida. A nota em si não é tocada.

Limite próprio de 120 req/min nesta rota — uma carga retroativa de milhares de
arquivos não divide o balde com o cadastro.

### Notas de entrada — `/integracao/notas-entrada`

Espelho da **SF1**. Chave `chave`
(`F1_FILIAL`-`F1_DOC`-`F1_SERIE`-`F1_FORNECE`-`F1_LOJA`-`F1_FORMUL`-`F1_TIPO`),
`codigoErp` = `F1_DOC`. Cabeçalho + `itens`, sempre juntos; cada item com a
própria `chave` (`D1_FILIAL`-`D1_DOC`-`D1_SERIE`-`D1_FORNECE`-`D1_LOJA`-`D1_COD`-`D1_ITEM`)
e sem `codigoErp`, nas
mesmas regras da nota de saída: item com `delete: true` é removido, e item
ausente do payload **não** é excluído. `fornecedorId`, `clienteId`, `dtEmissao`,
`ano` e `mes` dos itens são preenchidos pelo service a partir do cabeçalho — não
vêm no payload do item.

#### A SF1 guarda dois documentos, e `tipo` diz qual

| `tipo` | O que é | Mande |
|---|---|---|
| `'N'` | Compra | `fornecedorChave` |
| `'D'` | Devolução de venda | `clienteChave` |

No ERP os dois saem do mesmo par de campos (`F1_FORNECE`+`F1_LOJA`), mas apontam
para cadastros diferentes — SA2 na compra, SA1 na devolução. Por isso o payload
tem os dois campos, e o mapeador manda **um deles**. A plataforma aceita o que
vier e não impõe a combinação; mas é o `clienteChave` que faz a devolução
aparecer na aba "Devoluções" da Posição de Cliente, então mandar
`fornecedorChave` numa nota `'D'` deixa a devolução invisível para quem atende
o cliente.

A devolução **não** entra nas apurações (Objetivos, Consultas, Dashboard): quem
responde por ela ali continua sendo o `vlrDev` da própria nota de venda, enviado
por `/integracao/notas-saida`. As duas fontes somadas contariam a mesma
devolução duas vezes.

#### Demais campos

`condicaoChave` no cabeçalho, e `produtoChave` / `armazemChave` nos itens,
referenciam os respectivos cadastros pela `chave`, que precisa já existir.

Duas datas, e não uma: `dtEmissao` é a do documento emitido pelo terceiro e
`dtEntrada` é a do recebimento da mercadoria. `ano`/`mes` derivam da **emissão**,
para que a apuração de compra case com a de venda, que também usa emissão.

Os valores acessórios vêm **separados**, como a SF1 os guarda — somá-los num
"outras despesas" impediria conferir a nota contra o documento do fornecedor:

| Campo | Origem na SF1 |
|---|---|
| `vlrBruto` | `F1_VALBRUT` |
| `vlrIcmsSt` | `F1_ICMSRET` ("ICMS Solid.") |
| `vlrFrete` | `F1_FRETE` |
| `vlrSeguro` | `F1_SEGURO` |
| `vlrDespesa` | `F1_DESPESA` |

O item **não** tem `ncm`: o NCM é do produto (`B1_POSIPI` → `produtos.ncm`), e
repeti-lo na linha da nota criaria duas versões do mesmo dado.

Sem rotas de XML: a segunda via do documento de entrada é de quem o emitiu, e a
plataforma não a reimprime.

### Títulos a receber — `/integracao/titulos-receber`

Chave `chave`. Além do financeiro básico (`numero`, `parcela`,
`prefixo`, `emissao`, `vencimento`, `vencimentoReal`, `valor`, `saldo`,
`acrescimo`, `decrescimo`, `dtBaixa`, `formaPgto`, `historico`), carrega os
campos de **cobrança bancária** que a 2ª via de boleto usa (`nossoNumero` e
companhia) — todos opcionais, porque título pago em dinheiro, depósito ou PIX
não tem boleto.

---

## Orçamentos — `/integracao/orcamentos`

Chave `chave`. `status`: `rascunho`, `enviado`, `aprovado`, `recusado`,
`expirado`. `itens` **substitui o conjunto inteiro**, casando cada item pela `chave`.

O orçamento é a única entidade que anda **nos dois sentidos**: o ERP empurra os
dele, e a plataforma produz orçamentos próprios (feitos pelo vendedor na tela)
que o ERP precisa puxar.

### O sentido plataforma → ERP

```
GET   /integracao/orcamentos/pendentes
PATCH /integracao/orcamentos/pendentes/{id}
```

1. `GET .../pendentes` lista os orçamentos **aprovados** criados na plataforma
   que ainda não têm `chave` — prontos para o ERP importar.
2. O ERP importa e gera o pedido (SC5/SC6).
3. `PATCH .../pendentes/{id}` devolve o pedido e os itens juntos: a chave do
   SC5 (`C5_FILIAL-C5_NUM`), o número como `codigoErp` e, para cada item do
   orçamento (pelo `id` que veio no `GET`), a chave do SC6
   (`C6_FILIAL-C6_NUM-C6_ITEM-C6_PRODUTO`):

   ```json
   {
     "chave": "01-004512",
     "codigoErp": "004512",
     "itens": [
       { "id": "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f", "chave": "01-004512-01-11400443" }
     ]
   }
   ```

   Aqui — e só aqui — o `{id}` é o **id interno da plataforma** (UUID), o mesmo
   que veio no `GET .../pendentes`; ainda não existe código do ERP para usar.

4. A partir daí o orçamento passa a aparecer no `GET /integracao/orcamentos`
   normal, como qualquer outro.

O vínculo só pode ser feito **uma vez**. Retorna `409` se o orçamento já estiver
vinculado, se ainda não estiver aprovado, ou se a `chave` colidir com o de
outro orçamento.

> `GET /integracao/orcamentos` lista **só** os que já têm `chave`. Quem
> procura orçamento da plataforma ali não acha nada: eles estão em
> `.../pendentes` até serem vinculados.


---

## Lote — `PUT /integracao/<entidade>`

Todas as 13 entidades aceitam, além do CRUD individual, um `PUT` na raiz do
recurso que aplica até **1.000 registros por chamada**. É o caminho da carga
inicial e da ressincronização; para o fluxo diário o `POST` individual continua
valendo e não muda.

```jsonc
// PUT /api/v1/integracao/categorias
{
  "registros": [
    { "chave": "01-000001", "codigoErp": "000001", "descricao": "MATERIAL ELETRICO", "ativo": true },
    { "chave": "01-000002", "codigoErp": "000002", "descricao": "HIDRAULICA", "ativo": true },
    { "chave": "01-000009", "excluido": true }
  ]
}
```

O payload de cada registro é **o mesmo do `POST`** daquela entidade — o lote não
é um segundo contrato. Duas diferenças, só:

- `"excluido": true` marca o registro para soft delete e **dispensa os demais
  campos**: para apagar basta a chave.
- Sem `excluido`, o registro exige tudo o que o `POST` exigiria, e um campo que
  falte é apontado pelo nome.

### Resposta — sempre 200, com relatório

```jsonc
{
  "processados": 1000,
  "criados": 120,
  "atualizados": 875,
  "excluidos": 4,
  "erros": [
    { "indice": 37, "chave": "01-004417-01", "mensagem": "vendedorChave '01-000999' não encontrado" }
  ]
}
```

**O lote não é tudo-ou-nada.** Cada registro é aplicado na sua própria
transação: um item inválido não desfaz os que já passaram, e vem listado em
`erros` com o `indice` dele no array enviado — é por esse índice que o ERP sabe
o que reenviar. `erros` vazio significa que tudo entrou.

Os registros são aplicados **na ordem em que foram enviados**. Isso importa
quando um depende do outro dentro do mesmo lote (a categoria pai antes da
filha, o cliente antes da nota): mande o pai primeiro e ele estará lá.

### Erros do envelope (400)

- lote vazio (`registros: []`);
- acima de 1.000 registros;
- registro sem `chave`.

Nesses casos nada é gravado — a validação é do envelope, antes de qualquer
escrita.

### Por que existe

Medido na base real: 119.439 registros (67.151 notas, 37.682 títulos, 7.980
produtos, 6.626 clientes). Uma requisição por registro, contra o teto de
60 req/min, dava **~33 horas** de carga inicial. Em lotes de 1.000 são 120
chamadas — **~14 minutos** medidos em dev (6,9 ms por registro, 1.000
categorias em 6,9 s).

O `PUT` também é idempotente por natureza, o que resolve a assimetria que
obrigava o ERP a saber o estado antes de escolher o verbo: mesmo payload,
mesmo resultado, quantas vezes for.

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
  -d '{"chave":"01-11400443","codigoErp":"11400443","descricao":"DETERGENTE NEUTRO 5L","unidade":"GL","categoriaChave":"01-000004"}'

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
  -d '{"chave":"01-004512","codigoErp":"004512","itens":[]}'
```

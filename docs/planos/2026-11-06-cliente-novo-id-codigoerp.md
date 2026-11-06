# Cliente: ligação com o ERP pelo `codigoErp`; ID da plataforma só para cadastro novo

Item **C3** de `2026-11-06-pendencias-consolidadas.md` (etapa 9 de
`2026-10-16-correcoes-integracao-reversa.md`).

## Decisões do usuário (2026-11-06)

1. **A ligação entre o ERP e a plataforma é sempre pelo `codigoErp`.**
2. O **ID da plataforma** (uuid do cliente) é um código interno. Só trafega na integração
   quando o cliente é **incluído pela plataforma**, para receber de volta o `codigoErp`.
3. **Plataforma → ERP (cliente novo):** envia o ID. O ERP grava e **devolve o ID, o `codigoErp`
   e a `chave`**; a plataforma grava os dois últimos no cliente.
4. **ERP → plataforma (cadastro novo no ERP):** o ID vem vazio. Busca-se pelo `codigoErp`:
   existe → atualiza; não existe → cria.

Isto **substitui, para clientes**, a decisão de 22/09 (`2026-09-22-chave-integracao.md`: a
`chave` FILIAL-COD decide cadastrar/atualizar). A `chave` continua gravada e enviada, mas
deixa de ser o critério de busca do cliente. As demais entidades seguem como estão até o
usuário dizer o contrário (ver "Pergunta em aberto").

## Como está hoje (conferido no código)

- `IntegracaoClientesService.upsert` localiza por `chave` (única por empresa).
- `GET /integracao/clientes/alteracoes` só lista cliente **com chave** — o cliente novo fica
  de fora "até ganhar chave", e nada o faz ganhar.
- `ClientesService.create` (cadastro pela tela) **não enfileira nada** em
  `cliente_envios_erp`. Cliente criado na plataforma nunca chega ao ERP.
- `PATCH .../alteracoes/:id/aplicada` não recebe corpo: não devolve ID, `codigoErp` nem chave.

## Desenho

### 1. Plataforma → ERP (cliente novo)

- `cliente_envios_erp` ganha `operacao` (`incluir` | `alterar`, padrão `alterar`).
- `ClientesService.create` enfileira um item `incluir` com **todos** os campos de
  `CAMPOS_ENVIO_ERP` (não precisa de aprovação: o cliente nasce pelo usuário).
- `GET .../alteracoes` passa a listar também item `incluir` de cliente sem chave. Cada item
  traz `operacao`, `clienteId` (o ID da plataforma), `clienteChave` e `codigoErp` (vazios na
  inclusão).
- `PATCH .../alteracoes/:id/aplicada` aceita corpo `{ codigoErp?, chave? }`. Obrigatório
  (`codigoErp`) quando o item é `incluir`: grava no cliente e tira o item da fila. 409 se já
  confirmado, como hoje.
- Item `alterar` continua exigindo cliente com `codigoErp`/chave (já existe no ERP).

### 2. ERP → plataforma

- `integracaoClienteCreateSchema` ganha `id` opcional (uuid).
- `upsert`, nesta ordem: **`id`** (se veio) → **`codigoErp`** (não vazio) → **`chave`**
  (rede de segurança: evita criar duplicata e estourar a unicidade da `chave` com cliente
  antigo que ainda não tem `codigoErp`). Nenhum achou → cria.
- A resposta devolve o `id` da plataforma.

### 3. Lado Protheus (usuário)

`BJPLA004` (`U_BJRETORNO`): tratar `operacao = incluir` (CRMA980 inclusão), gravar o ID da
plataforma no cliente, e no `aplicada` mandar `{ codigoErp, chave }`. Contrato final do
corpo registrado aqui quando a API estiver pronta.

## Etapas

- [ ] 1. Migration `operacao` em `cliente_envios_erp`.
- [ ] 2. `ClientesService.create` enfileira `incluir`.
- [ ] 3. Fila `alteracoes` lista `incluir` sem chave e traz `operacao`/`clienteId`/`codigoErp`.
- [ ] 4. `aplicada` com corpo (`codigoErp`, `chave`) e gravação no cliente.
- [ ] 5. Contrato `id` opcional + `upsert` por id → codigoErp → chave.
- [ ] 6. Testes (fila de inclusão, aplicada com retorno, upsert por codigoErp e fallback).
- [ ] 7. Documentar o contrato (`docs/integracao`) e avisar o usuário para o `BJPLA004`.

## Pergunta em aberto

"A ligação é pelo `codigoErp` sempre": vale **só para clientes** (único cadastro que a
plataforma cria e envia) ou para **todas** as entidades? `codigoErp` não é único em tabelas por
filial (estoque, tabela de preço) e não existe nos itens, por isso a proposta é limitar a
clientes. Assumido assim até resposta.

# Cliente novo criado na plataforma: envio ao ERP e retorno de chave/codigoErp

Item **C3** de `2026-11-06-pendencias-consolidadas.md` (etapa 9 de
`2026-10-16-correcoes-integracao-reversa.md`).

## Decisões do usuário (2026-11-06)

1. A ligação entre ERP e plataforma é pelo código do ERP (`chave`/`codigoErp`). **O
   recebimento de clientes do ERP já funciona** (upsert pela chave) e **não muda**; o mesmo
   vale para produto, estoque e as demais entidades.
2. O ID da plataforma (uuid do cliente) é interno. Só trafega quando o cliente é **incluído
   pela plataforma**, para receber de volta o código do ERP.
3. **Plataforma → ERP (cliente novo):** envia o ID. O ERP grava e **devolve a `chave` e o
   `codigoErp`**; a plataforma os grava no cliente.
4. **ERP → plataforma, cadastro novo no ERP:** já resolvido pelo recebimento existente.

(Uma primeira versão deste plano propunha trocar o critério de busca do `upsert` para
`codigoErp`; foi descartada: na prática `codigoErp` e `chave` são o mesmo código do ERP e o
recebimento já funciona.)

## O buraco que havia

- `ClientesService.create` (cadastro pela tela) **não enfileirava nada**: cliente criado na
  plataforma nunca chegava ao ERP.
- `GET /integracao/clientes/alteracoes` deixava de fora cliente sem chave.
- `PATCH .../aplicada` não recebia corpo: não havia como o ERP devolver chave e `codigoErp`.

## Contrato novo (plataforma pronta, falta o BJPLA004)

- `GET /integracao/clientes/alteracoes`: cada item traz `operacao` (`incluir` | `alterar`),
  `clienteId` (ID da plataforma), `clienteChave` e `codigoErp` (vazios na inclusão), mais os
  campos de sempre. Na inclusão vão **todos** os campos que a SA1 recebe.
- `PATCH /integracao/clientes/alteracoes/:id/aplicada`:
  - `incluir`: corpo `{ "chave": "...", "codigoErp": "..." }` **obrigatório** (400 sem os
    dois). A plataforma grava no cliente. **409** se a chave já for de outro cliente (evita
    duplicata) ou se o item já foi confirmado.
  - `alterar`: corpo ignorado, como antes.
- Sem a confirmação o item continua pendente e volta no ciclo seguinte.

## Etapas

- [x] 1. Migration `20261106100000_cliente_envios_erp_operacao` (coluna `operacao`, itens
      existentes ficam `alterar`) e `schema.prisma`.
- [x] 2. `ClientesService.create` enfileira `incluir`.
- [x] 3. Fila lista `incluir` sem chave e traz `operacao`/`clienteId`/`codigoErp`.
- [x] 4. `aplicada` com corpo e gravação de chave/codigoErp no cliente.
- [x] 5. Testes (`integracao-clientes-alteracoes.service.spec.ts`, 5 casos). Suítes
      `integracao` + `clientes`: 203 passam; `tsc` limpo.
- [~] 6. **Migration aplicada em dev (06/11); falta a conferência ponta a ponta pela tela.** Original: aplicar a migration em dev (role dona, conforme o runbook) e conferir de ponta a
      ponta: criar cliente na tela → aparece em `alteracoes` como `incluir` → `aplicada` com
      chave/codigoErp → cliente com chave.
- [~] 7. **Escrito em 06/11 (`BJIncluiCliente` em `BJPLA004.prw`); falta copiar para o G:, compilar e testar.** Original, Protheus (usuário): `BJPLA004` tratar `operacao = incluir` (CRMA980 inclusão) e
      confirmar com `{ chave, codigoErp }`. Fontes em `docs/integracao/advpl/BJPLA004.prw`.
- [x] 8. (TASK-060 e `MV_BJCLITP` registrados) Atualizar `docs/integracao/advpl/PLANO.md` quando o BJPLA004 estiver pronto.

## Atenção

- Cliente criado pela plataforma **antes** do BJPLA004 novo ficará pendente na fila. Se o
  BJPLA004 antigo ler o item `incluir`, deve ignorá-lo (não confirmar sem chave); a API
  recusa a confirmação sem chave, então nada se perde nem duplica.
- Cliente criado pelo recebimento do ERP (`upsert`) não entra na fila (não é `create` da tela).

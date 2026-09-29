# Plano: situação do orçamento conforme o pedido no ERP

> **Status (28/09/2026): regras fechadas; implementação a aprovar.** Mexe no
> ADVPL — depende da autorização do usuário.

## O problema

O orçamento aprovado na plataforma vira Pedido de Venda (SC5/SC6) pelo
`U_BJRETORNO`, que devolve a chave do pedido (`BJVincula`). Depois disso nada
volta: o orçamento fica "aprovado" para sempre, mesmo com o pedido bloqueado,
faturado ou excluído no ERP. E o orçamento que o `MATA410` recusa continua
"aguardando" na plataforma, sem motivo — o erro fica só na SZZ.

Hoje a situação em relação ao ERP é deduzida de dois campos (`status` e
`chave`): *não vai ao ERP* (não aprovado), *aguardando o ERP* (aprovado, sem
chave), *virou pedido* (aprovado, com chave).

## Situações (decisão do usuário, 28/09/2026)

| Orçamento | Pedido no ERP |
|---|---|
| **Aguardando Integração** | Aprovado na plataforma, pedido ainda não criado |
| **Erro de integração** | O ERP recusou o pedido (`MATA410`) — com o motivo |
| **Pendente** | Pedido recebido no ERP |
| **Liberado** | Pedido liberado no ERP |
| **Bloqueado Crédito** | Pedido recebido no ERP e com bloqueio de crédito |
| **Bloqueado Estoque** | Pedido recebido no ERP e com bloqueio de estoque |
| **Bloqueado Desconto** | Pedido recebido no ERP e com bloqueio de desconto |
| **Faturado parcial** | Pedido faturado parcial no ERP |
| **Faturado** | Pedido faturado no ERP |
| **Cancelado** | Pedido excluído no ERP |
| *+ com quebra* | Marca junto de qualquer situação acima: pedido alterado no ERP em relação ao orçamento |

**Precedência dos bloqueios:** Desconto (`C5_LIBDESC = 2`, vence todos) →
Crédito (`C9_BLCRED`) → Estoque (`C9_BLEST`). `C5_LIBDESC` em branco = liberado.

**Faturado / Faturado parcial:** o orçamento mostra o número e a data da(s)
nota(s).

## Regras fechadas (usuário, 28/09/2026)

- **Com quebra** acompanha a situação (ex.: **Liberado — com quebra**) e vale
  para **qualquer** diferença entre o pedido no ERP e o orçamento aprovado:
  item incluído ou retirado, quantidade ou preço diferente.
- Bloqueios: Desconto (`C5_LIBDESC = 2`, em branco = liberado) vence todos,
  depois Crédito (`C9_BLCRED`), depois Estoque (`C9_BLEST`).
- Faturado e Faturado parcial mostram número e data das notas.

## Desenho

### Plataforma

- Orçamento ganha, **separada do `status` comercial**: `situacaoErp` (as
  situações acima), `comQuebra`, `erroIntegracao` (motivo da recusa),
  `situacaoErpEm` (última atualização) e a lista de notas (número, série,
  data). Aprovado sem pedido = **Aguardando Integração**, sem gravar nada.
- Rota nova de integração **`PUT /integracao/pedidos`** (lote, mesmo molde das
  outras): o ERP manda o pedido pela chave (`C5_FILIAL-C5_NUM`, a mesma que o
  `BJVincula` gravou no orçamento) com a situação já calculada, os itens
  (chave SC6, produto, quantidade, preço, quantidade entregue) e as notas. A
  plataforma acha o orçamento pela chave, grava a situação e **calcula a
  quebra** comparando os itens com os do orçamento. Pedido sem orçamento
  (digitado no ERP) é ignorado. `excluido: true` = **Cancelado**.
- Rota para o ERP informar a **recusa** do pedido: `erroIntegracao` com o
  motivo; volta a **Aguardando Integração** quando o próximo retorno acertar.
- Tela do orçamento: a situação ERP (com a marca de quebra) e as notas.

### Protheus (ADVPL)

- **Mapeador novo `U_BJMAPPED`** (entidade `pedidos` no catálogo): só os
  pedidos que vieram da plataforma (o vínculo está na SZZ de entrada,
  `ZZ_CHVDES`). Lê por `S_T_A_M_P_` da SC5, SC6, SC9 e da SD2 do pedido — o
  faturamento muda a SD2, não a SC5. Calcula a situação: excluído → Cancelado;
  todo `C6_QTDENT` = `C6_QTDVEN` → Faturado; algum entregue → Faturado parcial;
  `C5_LIBDESC = 2` → Bloqueado Desconto; `C9_BLCRED` → Bloqueado Crédito;
  `C9_BLEST` → Bloqueado Estoque; liberado na SC9 → Liberado; senão Pendente.
  Notas: SD2 pelo `D2_PEDIDO`.
- **`U_BJRETORNO`** passa a avisar a plataforma quando o `MATA410` recusar
  (`BJErroOrc`), com o log do ExecAuto.

### Carga inicial

- O SQL (`docs/integracao/sql`) ganha a entidade `pedidos`, com a mesma
  regra, para os pedidos já vinculados a orçamentos.
## Decisão pendente

- **Autorizar a mudança no ADVPL** (mapeador novo e ajuste no `U_BJRETORNO`).
  Sem ela, só a parte da plataforma e do SQL sai, e o orçamento não recebe
  atualização no dia a dia.

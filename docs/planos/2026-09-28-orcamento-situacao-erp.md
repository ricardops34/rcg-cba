# Plano: situação do orçamento conforme o pedido no ERP

> **Status (29/09/2026): aprovado pelo usuário, em implementação por fases.**
> Fase 1 (plataforma) escrita em 29/09 — campos no orçamento (migration
> `20260929200000_orcamento_situacao_erp`), `POST`/`PUT`/`DELETE
> /integracao/pedidos`, `pedidos` na carga por arquivo,
> `PATCH /integracao/orcamentos/pendentes/{id}/erro` e a tela. Fase 2 (ADVPL)
> escrita em 29/09 — `U_BJMAPPED` no `BJPLA003`, entidade `pedidos` no
> catálogo, grupo no monitor e o aviso de recusa no `BJErroOrc`. Falta aplicar
> a migration, compilar os fontes e testar ponta a ponta. Fase 3: SQL da carga
> inicial. O código ADVPL vive em `C:\VPS\protheusrcg\Portal\BJ`; os `.prw`
> em `docs/integracao/advpl` são cópia. O desenho abaixo já é o implementado;
> as decisões ainda abertas estão no fim.

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

## Desenho (como implementado em 29/09/2026)

### Plataforma

- Orçamento ganha, **separada do `status` comercial**: `situacaoErp`,
  `situacaoErpEm`, `comQuebra`, `erroIntegracao`, `erroIntegracaoEm` e
  `notasErp` (número, série, emissão). Migration
  `20260929200000_orcamento_situacao_erp`. Mais `itensErp` (os itens do
  pedido como o ERP mandou por último), migration
  `20260929210000_orcamento_itens_erp`.
- **O enum `SituacaoErpOrcamento` tem 8 valores, não 10.** Aguardando
  Integração e Erro de integração não são gravadas: saem do próprio orçamento
  (`situacaoIntegracaoOrcamento`, em `packages/contracts/src/orcamento.ts`) —
  aprovado sem `chave` = Aguardando; aprovado sem `chave` com
  `erroIntegracao` = Erro de integração.
- Rota **`/integracao/pedidos`** com `POST` (um pedido), `PUT` (lote) e
  `DELETE /{chave}` (Cancelado), sem `GET`. `POST` e `DELETE` existem porque o
  envio do ERP é por mensagem, com o verbo da SZZ; só o "Enviar em Bloco" usa
  o `PUT`. O ERP manda o pedido pela chave (`C5_FILIAL-C5_NUM`, a mesma que o
  `BJVincula` gravou no orçamento) com a situação calculada, os itens (chave
  SC6, produto, quantidade, preço, quantidade entregue) e as notas. A
  plataforma acha o orçamento pela chave, grava a situação e **calcula a
  quebra** comparando os itens pela chave do SC6 (tolerância de meio centavo
  no preço). **Pedido sem orçamento vinculado não é ignorado:** responde `404`
  (ou vai em `erros` no lote) — o ERP só manda pedido da plataforma, e um sem
  orçamento é inconsistência que precisa aparecer. `pedidos` também entra na
  carga por arquivo.
- **`PATCH /integracao/orcamentos/pendentes/{id}/erro`**: o ERP informa a
  recusa com o motivo. O orçamento **sai** de `.../pendentes` (o filtro é
  `erroIntegracao` nulo) e fica como Erro de integração; o ERP não tenta de
  novo, e o caminho é copiar.
- Tela: ícone e legenda na listagem; na aba "Aprovação e integração", a
  situação, a quebra, o motivo da recusa, as notas e a tabela **Orçamento x
  pedido no ERP** — item a item, quantidade e preço dos dois lados, quanto já
  foi faturado, o saldo e a diferença (retirado, incluído, quantidade ou preço
  alterados). O rótulo de `faturado_parcial` é **Faturando**.

### Protheus (ADVPL)

- **`U_BJMAPPED`** (`BJPLA003`, entidade `pedidos` no catálogo do `BJPLA002`,
  grupo "Pedidos de Venda" no monitor). O pedido da plataforma é reconhecido
  por **`C5_ORGPED = 'P'`**, gravado pelo `BJGeraPed` — não pela SZZ de
  entrada, que o expurgo apaga depois de `MV_BJAPI11` dias.
- A janela olha o `S_T_A_M_P_` da SC5, SC6, SC9 e SD2 (pela `D2_PEDIDO`),
  **incluindo linhas excluídas**: liberação, estorno de liberação,
  faturamento e estorno de nota mudam SC6/SC9/SD2 sem encostar na SC5. A
  situação é recalculada do estado atual, então um estorno volta o pedido para
  Liberado ou Pendente sozinho.
- Situação, nesta ordem: excluído → `DELETE` (Cancelado); todo item
  encerrado e algum por resíduo (`C6_BLQ = 'R'`) → Cancelado; todo
  `C6_QTDENT` ≥ `C6_QTDVEN` → Faturado; algum `C6_QTDENT` > 0 → Faturando;
  `C5_LIBDESC = "2"` → Bloqueado Desconto; SC9 não faturada com `C9_BLCRED`
  preenchido **e diferente de `10`** → Bloqueado Crédito; idem `C9_BLEST` →
  Bloqueado Estoque; SC9 não faturada sem bloqueio → Liberado; senão Pendente.
  Notas: SD2 pelo `D2_PEDIDO`.
- Conferido no dicionário em 29/09/2026: `C5_LIBDESC` existe, combo
  `1=SIM;2=NAO` (`2` = desconto não liberado = bloqueado); `C5_ORGPED` tem
  `P=Plataforma`; SC5, SC6, SC9 e SD2 têm `S_T_A_M_P_`.
- Pedido excluído que nunca subiu: a coleta põe antes um `POST` com o payload
  dele (`BJJsonInc`), então o mapeador monta os itens a partir das linhas
  excluídas da SC6 — o `POST` precisa ser válido.
- **`BJErroOrc`** avisa a recusa do `MATA410` pelo `PATCH .../erro`.

### Carga inicial

- O SQL (`docs/integracao/sql`) ganha a entidade `pedidos`, com a mesma
  regra, para os pedidos já vinculados a orçamentos. **Ainda não feito.**

## Decisões (usuário) — todas fechadas em 29/09/2026

1. ~~Eliminação de resíduo~~ — **decidido em 29/09/2026: resíduo eliminado =
   Cancelado.** Item com `C6_BLQ = 'R'` conta como encerrado; pedido com todos
   os itens encerrados e algum por resíduo vai como `situacao: "cancelado"`
   (por `POST`, com as notas do que chegou a faturar). Resíduo em só parte dos
   itens não cancela: o pedido segue pelos itens abertos.
2. ~~Parcial com bloqueio~~ — **decidido em 29/09/2026: faturado em parte
   mostra "Faturando", apontando as diferenças.** Faturando continua vencendo
   os bloqueios; a tabela Orçamento x pedido mostra, item a item, o faturado e
   o saldo. (Parte liberada e parte bloqueada, sem nada faturado: o bloqueio
   vence o Liberado.)
3. ~~Orçamento recusado pelo ERP~~ — **decidido em 29/09/2026: fica marcado
   como erro e pode ser copiado.** Sai da fila de pendentes; o ERP não tenta
   de novo. O vendedor copia, corrige e aprova o novo.
4. ~~Status comercial com pedido Cancelado~~ — **decidido em 29/09/2026: o
   orçamento cancelado pode ser copiado.** Continua `aprovado` e imutável; o
   "Copiar" (que já existia para aprovado e vencido) gera um novo, em
   rascunho, sem a situação do ERP. A tela aponta esse caminho.

## Riscos conhecidos

- **Ordem das mensagens.** `situacaoErpEm` é a hora de chegada. Uma mensagem
  antiga reenviada depois de uma nova sobrescreveria a situação. O envio já
  descarta a mensagem superada (`BJSuperada`: mesma chave com mensagem em lote
  mais novo), o que cobre o caso normal; o reenvio manual de lote antigo
  também passa por ela. Se aparecer na prática, a saída é o ERP mandar o
  `S_T_A_M_P_` e a plataforma ignorar o que for mais antigo.

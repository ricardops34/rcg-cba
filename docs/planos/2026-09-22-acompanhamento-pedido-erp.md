# Plano: acompanhamento do pedido no ERP

> **Status (22/09/2026): em desenho.** Decisões tomadas abaixo; ainda faltam as
> marcadas em [Em aberto](#em-aberto). Nada implementado.

## Contexto

O orçamento aprovado na plataforma vira Pedido de Venda no ERP
(`U_BJRETORNO` → `MATA410`), e hoje o ERP responde **uma única vez**: o
`PATCH /integracao/orcamentos/pendentes/{id}` grava a chave do SC5, o número e
as chaves dos SC6 (ver
[`2026-09-22-chave-integracao.md`](./2026-09-22-chave-integracao.md)).

Depois disso o pedido continua andando no ERP — liberação, bloqueios,
faturamento, cancelamento — e **a plataforma não fica sabendo**. Quem vendeu
abre o orçamento e não sabe dizer se já faturou. É isso que este plano resolve.

## A regra

O ERP avisa a plataforma a cada mudança de situação do pedido, e identifica o
registro pelo **id da plataforma** (UUID), que é o mesmo que veio no
`GET /integracao/orcamentos/pendentes`.

Situações (decisão do usuário em 22/09/2026):

| Situação | Quando |
|---|---|
| `liberado` | pedido liberado para faturamento |
| `bloqueado_credito` | retido na análise de crédito |
| `bloqueado_desconto` | retido por desconto acima do permitido |
| `bloqueado_estoque` | retido por falta de saldo |
| `faturado_parcial` | "quebra": atendido em mais de uma nota, ainda com saldo |
| `faturado` | atendido por completo |
| `cancelado` | cancelado ou excluído no ERP |

A plataforma guarda **a situação atual** no orçamento (para a tela e os
filtros) **e o histórico** de cada evento, com data e origem. A linha do tempo
é o que responde "quando foi liberado" e "quando faturou".

## O pré-requisito: o pedido precisa carregar o id da plataforma

Liberação, bloqueio e faturamento acontecem dias depois, em rotinas do Protheus
que não conhecem a fila da integração. Para avisar, quem processa o pedido
precisa saber de qual orçamento ele veio.

**Guardar isso só na SZZ não serve:** a mensagem é do momento da criação e é
expurgada depois de `MV_BJAPI11` dias (90 por padrão).

Por isso o id da plataforma tem que morar no próprio pedido, num campo novo do
dicionário (ex.: `C5_XIDPLAT`, C(36)), gravado pelo `BJPLA004` na criação.
É a mesma ideia do `ZZ_CHVORI`, mas no documento, não na fila.

## Em aberto

1. **Como o ERP detecta cada evento.** Ponto de entrada nas rotinas
   (`MATA410`, `MATA440`, faturamento) ou um JOB que varre SC5/SC9/SF2 por
   `S_T_A_M_P_`, no mesmo desenho da coleta de saída? O JOB é mais simples de
   manter e não depende de PE em rotina padrão; o PE avisa na hora.
2. **Como identificar cada situação no dado.** Quais campos dizem liberado
   (SC9/C9_BLCRED?), bloqueio de crédito, de desconto e de estoque, quebra e
   cancelamento. Precisa da conferência no dicionário e nos dados reais.
3. **Rota da API.** Provável `PATCH /integracao/orcamentos/{id}/situacao`, com
   `{ situacao, ocorridoEm, documento?, observacao? }` — o `{id}` é o UUID da
   plataforma, como no vínculo. Definir também se aceita reenvio do mesmo
   evento (idempotência).
4. **O que a tela mostra.** Coluna/etiqueta na listagem de orçamentos e a linha
   do tempo no detalhe.
5. **Campo no dicionário.** Criar `C5_XIDPLAT` (ou nome equivalente) e decidir
   se entra por UPDDISTR.

## Ordem de execução (quando fechar o desenho)

1. Dicionário: campo do id da plataforma no SC5.
2. Banco e API: situação atual + tabela de histórico, e a rota.
3. Protheus: gravar o id na criação do pedido e mandar os eventos.
4. Telas.
5. Documentação (`docs/integração/endpoints.md` e o README do ADVPL).

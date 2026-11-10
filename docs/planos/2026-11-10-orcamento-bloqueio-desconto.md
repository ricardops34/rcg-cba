# Orçamentos — bloqueio por desconto na listagem

Status: em implementação (2026-11-10).

## Contexto

Item com desconto igual ou acima do "% Desc Máximo" da regra trava PDF, link e
efetivação até o superior liberar (`orcamentoExigeAutorizacao`,
`descontoSolicitadoEm/AutorizadoEm/RecusadoEm`). O status do orçamento não muda —
a trava é à parte —, e a listagem não mostrava nada disso: o supervisor/gerente não
tinha como achar o que precisa analisar.

## Decisões do usuário (2026-11-10)

1. **Aviso só para o superior direto.** Sino e Agenda continuam indo só para o
   `superiorId` do vendedor; gerente acima não é avisado (mas consegue aprovar pela
   Posição de Cliente, o escopo pega a árvore toda). Sem mudança no código.
2. **Listagem pela hierarquia, mantendo as exceções.** O escopo atual já é a árvore
   vendedor → supervisor → gerente; Administrador/carteira completa e o vendedor com
   "atende outras carteiras" (decisão de 06/11) continuam vendo todos. Sem mudança.
3. **Identificar e filtrar bloqueados** na listagem: etiqueta na linha e filtro
   "Desconto" com *Bloqueado* (sem pedido), *Aguardando liberação*, *Liberado* e
   *Recusado*.
4. **Qualquer alteração derruba a liberação.** Antes só mudar itens derrubava; agora
   qualquer campo alterado (cliente, tabela, condição, datas, observação…) também. Só
   mudar o status (efetivar/recusar) ou o ativo não derruba.

5. **Filtro rápido de carteira** para o vendedor com "atende outras carteiras":
   *Minha carteira* (padrão) | *Outras carteiras* | *Todas*. Minha = ele e a árvore
   abaixo; parâmetro `carteira` na listagem. Quem não tem a marca não vê o filtro.
6. Atalhos "Aguardando liberação" e "Bloqueados por desconto" na barra de filtros
   rápidos para quem tem `orcamentos.aprovar`.

## Achado: efetivar pelo formulário falhava com desconto liberado

O formulário sempre manda os itens no PATCH. O servidor apagava a liberação sempre
que recebia itens — mesmo iguais — e em seguida recusava a efetivação por falta de
liberação. Pela listagem funcionava (só manda o status). Com o item 4 a liberação só
cai quando algo **muda de fato**, o que resolve o efetivar pelo formulário.

## Implementação

- Contrato: `orcamentoQuerySchema.desconto`; `Orcamento.exigeAutorizacaoDesconto`
  (calculado na listagem); `situacaoDescontoOrcamento()` para tela e servidor.
- API: SQL que acha os orçamentos abertos (rascunho/enviado) com item acima do
  máximo — mesma regra de `orcamentoExigeAutorizacao`; filtro e marcação por linha.
- `update`: compara itens (produto, quantidade, preço) e cabeçalho com o gravado;
  derruba a liberação só se mudou.
- Web: etiqueta na coluna de status e filtro "Desconto" na listagem.

## Pendente

- Conferência visual da listagem.

## Histórico da autorização (2026-11-10)

Pedido do usuário: mostrar justificativas de solicitação/liberação/recusa, quem
liberou ou recusou, e data e hora. Rota `GET /orcamentos/:id/historico-desconto`
(lê as Atividades que cada etapa já grava — todas as rodadas, inclusive as que a
recusa/novo pedido limparam dos campos do orçamento). Tabela na aba "Aprovação e
integração" e nome + justificativa no aviso do topo do formulário.

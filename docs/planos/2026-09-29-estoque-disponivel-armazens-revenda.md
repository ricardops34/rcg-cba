# Plano: estoque disponível e só armazéns de revenda

> **Status (29/09/2026): código escrito; API compila e os testes existentes
> passam. Falta:** aplicar a migration, compilar o `BJPLA003.prw` no Protheus,
> reenviar armazéns e estoque, e conferir na tela. Nenhum teste cobre a soma do
> orçamento nem o filtro de revenda da tela de Estoque.

## O problema

1. O orçamento mostrava como "Estoque" a soma de `B2_QATU` — o saldo físico.
   Reserva, empenho e o que já está comprometido não eram descontados: o
   vendedor via mais do que podia vender.
2. A coleta do Protheus só manda o estoque dos armazéns de revenda
   (`MV_BJAPI16`, decisão de 26/09), mas a plataforma soma todas as linhas que
   tem. Linha de armazém que saiu da lista — ou que entrou por carga de
   arquivo — continuava somando.

## Decisões (29/09/2026)

| # | Decisão |
|---|---|
| 1 | O disponível é o do **`SaldoSB2()`** padrão do Protheus — o mesmo que o pedido de venda considera. O ERP calcula e envia; a plataforma não refaz a conta. |
| 2 | **Na plataforma só conta o saldo dos armazéns do `MV_BJAPI16`, em todos os lugares** (tela de Estoque, orçamento). |

## Desenho

### Armazém de revenda

- `armazens.revenda` (boolean, default `true`). O ERP é a fonte: o
  `U_BJMAPARM` envia `revenda = .T.` quando o armazém está no `MV_BJAPI16` (ou
  quando o parâmetro está vazio — "todos").
- Toda leitura de estoque na plataforma filtra `armazem.revenda = true`.
- Default `true` para não zerar o estoque de ninguém no deploy: até os
  armazéns serem reenviados, vale o comportamento de antes.

### Disponível

- `estoques.disponivel` (float, opcional). O `U_BJMAPEST` posiciona a SB2 e
  envia `SaldoSB2()`.
- O orçamento soma `disponivel` dos armazéns de revenda; linha sem
  `disponivel` (enviada antes desta mudança) cai no `saldo`.
- A tela de Estoque continua mostrando o saldo físico (`saldo`) e a reserva.

## Depois do deploy (operação)

1. Compilar o `BJPLA003.prw` no Protheus.
2. Reenviar **armazéns** (monitor → Gerar → Cadastros, ou Individual →
   armazens). Sem isso todo armazém segue como revenda.
3. Reenviar **estoque** (Gerar → Estoque, sem data) para preencher o
   `disponivel` de todas as linhas.
4. Sempre que o `MV_BJAPI16` mudar, repetir 2 e 3: a marca d'água não enxerga
   troca de parâmetro.

## Tarefas

| Tarefa | Situação |
|---|---|
| Migration `20260929100000_estoque_disponivel_armazem_revenda` | ✍️ escrita, não aplicada |
| Contratos de integração (armazém e estoque) e `armazemSchema` (`revenda` + filtro) | ✅ |
| Serviços de integração gravam os campos novos | ✅ |
| Tela de Estoque filtra revenda (lista, detalhe e seletor de armazém); orçamento soma o disponível dos armazéns de revenda | ✅ |
| Filtro "sem saldo" da tela: só as linhas que contam precisam estar zeradas (antes, uma linha de armazém inativo derrubava o produto do filtro) | ✅ |
| `U_BJMAPARM` envia `revenda`; `U_BJMAPEST` envia `disponivel` | ✍️ escrito, falta compilar |
| Documentação (`endpoints.md`, README do ADVPL) | ✅ |

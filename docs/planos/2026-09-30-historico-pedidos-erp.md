# Plano: histórico de pedidos do ERP (SC5/SC6) como orçamentos

> **Status (01/10/2026): aplicado em dev; falta compilar o ADVPL e testar.**
> Plataforma: migration `20260930290000_historico_pedidos_erp` (aplicada em
> dev em 01/10, junto com `20260930300000_parametro_ultima_comunicacao_erp`),
> `/integracao/pedidos` cria o histórico, filtros no Portal e na IA do
> WhatsApp do cliente, número mostrado por `numeroOrcamento()`, aviso na tela.
> ADVPL: `U_BJMAPPED` em `BJPLA003.prw`. A cópia de `docs/integracao/advpl`
> reuniu a regra do resíduo (só existia em `C:\VPS\protheusrcg\Portal\BJ`) e
> as mudanças de 30/09 (só existiam aqui), e foi copiada para o `protheusrcg`
> em 01/10 com `BJPLA002` e `BJPLA004`. SQL: bloco `pedidos` do
> `01-instalar.sql`. **Falta:** compilar os três fontes no Protheus, rodar o
> `01` de novo, a carga de `pedidos` e testar de ponta a ponta.
> Continuação de `2026-09-28-orcamento-situacao-erp.md`, que trata o pedido
> que **nasceu** na plataforma. Este trata o pedido digitado **direto no ERP**
> (televendas, Máxima etc.).

## O problema

Hoje o caminho é um só: o orçamento aprovado na plataforma vira pedido
SC5/SC6 (`MATA410`), e a situação do pedido volta por `/integracao/pedidos`.
O `U_BJMAPPED` só manda pedido com `C5_ORGPED = 'P'`, e a plataforma responde
`404` a pedido sem orçamento vinculado — pela regra de 29/09, isso era
inconsistência.

Com isso, o vendedor não vê na plataforma o que o cliente comprou fora dela.
O SCJ/SCK continua fora (decisão de 21/09/2026); o histórico vem do pedido.

## Decisões do usuário (30/09/2026)

1. **Período da carga inicial:** últimos **12 meses** (`C5_EMISSAO`).
2. **Contínuo:** sim. Depois da carga, pedido novo digitado no ERP também
   entra, e a situação, as notas e o cancelamento acompanham como no pedido
   da plataforma.
3. **Visibilidade:** **só uso interno** — tela de Orçamentos e agente
   interno (inclui o WhatsApp do funcionário). Portal do Cliente e IA do
   WhatsApp do cliente continuam vendo só o que nasceu na plataforma.
4. **Numeração:** o pedido histórico **não recebe número de proposta**; mostra
   o nº do pedido (`C5_NUM`). A sequência das propostas não pula.

## Exclusão (decisão do usuário, 01/10/2026)

- **Orçamento vindo do ERP não se exclui na plataforma** — nem pela tela,
  nem pela API (`podeExcluirOrcamento`). Na plataforma só se exclui orçamento
  sem integração: não enviado ao ERP, ou recusado por ele.
- **Excluir é no ERP, e reflete aqui:** pedido digitado no ERP e excluído lá
  **some da plataforma** (exclusão lógica, `DELETE /integracao/pedidos`). O
  orçamento que nasceu na plataforma continua indo para Cancelado.
- O `U_BJMAPPED` manda a exclusão de pedido do ERP **de qualquer data** — o
  corte de 12 meses vale só para incluir/atualizar.

## Desenho

### Plataforma

- **`OrigemVenda` ganha `erp`** (rótulo "ERP"). É ela que separa o histórico
  em todo lugar — não a ausência de número.
- **`Orcamento.numero` passa a aceitar nulo.** O unique `(empresaId, numero)`
  continua (nulos não colidem no Postgres). Onde o número aparece (PDF,
  atividades, busca, tela), o nulo cai no `codigoErp`.
- **`/integracao/pedidos` cria o orçamento quando não acha.** O payload ganha
  `clienteChave`, `vendedorChave`, `condicaoPagamentoChave` e `emissao`
  (`C5_EMISSAO`, AAAA-MM-DD) — opcionais no contrato, obrigatórios só para
  criar. Pedido sem orçamento e sem esses campos continua `404`.
- O orçamento criado assim: `origem = erp`, `status = aprovado`,
  `numero = null`, `chave` = chave do pedido, `codigoErp = C5_NUM`,
  `titulo = "Pedido <C5_NUM>"`, `createdAt` = emissão, itens com a chave do
  SC6, quantidade e preço do ERP, **sem recalcular pela Tabela de Preço**,
  sem `dataValidade`, sem Atividade de retorno.
- **Pedido de origem `erp` é espelho do ERP:** a cada mensagem os itens são
  regravados como vieram, e `comQuebra` fica falso — quebra é diferença entre
  o que a plataforma aprovou e o que o ERP fez, e aqui não há o primeiro lado.
- **Imutável na tela** (já é: aprovado não se edita). **Copiar** funciona e
  gera um rascunho normal, com número — serve para "repetir o pedido".
- **Filtros de visibilidade:** `origem != erp` no Portal do Cliente
  (`portal-cliente.service.ts`) e nas consultas da IA do WhatsApp do cliente
  (`whatsapp-triagem.service.ts`).
- `PUT /integracao/orcamentos` não muda e continua sem uso pelo ERP.

### Protheus (ADVPL)

- **`U_BJMAPPED`** deixa de filtrar `C5_ORGPED = 'P'`. Para o pedido que
  **não** é da plataforma, manda também cliente (`C5_FILIAL-C5_CLIENTE-C5_LOJACLI`
  no formato da chave do SA1), vendedor (`C5_VEND1`), condição (`C5_CONDPAG`)
  e emissão — e só se `C5_EMISSAO` estiver dentro dos 12 meses (janela móvel).
  Pedido mais antigo que mudar não sobe.
- Pedido da plataforma segue igual; mandar os campos novos para ele também
  não faz mal (a plataforma ignora quando acha o orçamento).

### Carga inicial

- Bloco `pedidos` do `BJ_CARGA_JSONL` (`docs/integracao/sql`) sem o filtro de
  `C5_ORGPED`, com os campos novos e `C5_EMISSAO >= hoje - 12 meses`.

## Na tela

- Status comercial **Aprovado** (imutável), origem **ERP** e a situação do
  pedido (Pendente, Liberado, Bloqueado…, Faturando, Faturado, Cancelado),
  com as notas. O aviso no topo do formulário diz que é histórico do ERP e
  aponta o **Copiar**.

## Riscos conhecidos

- **Cadastro ausente:** pedido com cliente, vendedor ou produto que não existe
  (ou foi excluído) na plataforma vai para `erros` do lote. Esperado no
  começo; o relatório da carga mostra quais.
- **Volume:** 12 meses de SC5 numa carga só. O lote já é de 1.000 e a carga
  é em segundo plano; conferir o tempo na primeira rodada.
- **Ordem das mensagens:** o mesmo risco do plano de 28/09.

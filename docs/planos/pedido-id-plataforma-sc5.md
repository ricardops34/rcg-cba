# ID da plataforma gravado no pedido do ERP (SC5)

Decisão do usuário (2026-10-19): o pedido gerado a partir de um orçamento da plataforma precisa carregar o id
dela, para o ERP devolver o `C5_NUM` e **todas as atualizações de status** ao orçamento de origem. O orçamento
aprovado recebe atualização; o pedido nunca entra como registro novo.

## Antes
- O pedido levava só `C5_ORGPED = "P"`. O elo id → pedido ficava na SZZ do ERP e, depois do `PATCH` de vínculo,
  na chave `C5_FILIAL-C5_NUM` do orçamento. Sem o vínculo, a atualização não achava o orçamento e a plataforma
  gravava um histórico novo (origem erp).

## Agora
- **Campo novo na SC5 (criar no dicionário): `C5_XIDPLA`, caractere, 36** — o UUID do orçamento. Sem o campo,
  os fontes avisam no log e seguem como antes (FieldPos).
- `BJGeraPed` (BJPLA004) grava `C5_XIDPLA`. `BJRETORNO` olha a SC5 por `C5_XIDPLA` antes de criar: se já existe
  pedido, só refaz o vínculo (nunca um segundo pedido, mesmo com a SZZ limpa).
- `BJMAPPED` (BJPLA003) envia em toda atualização `origemPlataforma` (C5_ORGPED = P) e `orcamentoId`.
- Plataforma (`PUT /integracao/pedidos`): acha pela chave; sem ela, pelo `orcamentoId` — liga o pedido (chave,
  `codigoErp`, chave de cada item casada pelo produto) e atualiza o status. Pedido da plataforma que não acha
  o orçamento volta 404 (o ERP tenta de novo); **não** vira histórico. Orçamento já ligado a outro pedido ou
  não aprovado: 409.

## Falta
- Criar `C5_XIDPLA` no dicionário do ERP; compilar e rodar BJPLA003/004; pedidos já criados sem o campo
  continuam dependendo do vínculo da chave (podem ser preenchidos por script a partir da SZZ).

# 2ª via de DANFE e Boleto

> Plano registrado em 2026-08-21, com as decisões fechadas com o usuário na mesma data.

## Contexto

As ações de WhatsApp de hoje (`WhatsappAcoesService.enviarTitulos` / `enviarNotas`)
mandam **texto** com os dados — número, vencimento, valor. É o que dava para fazer:
`TituloReceber` não tem nosso número nem dados do convênio, e `NotaSaida` guarda a
chave da NF-e, não o DANFE. O plano do WhatsApp registrou os dois como dependência
externa ("boleto e DANFE continuam fora"). Esta missão fecha essa lacuna.

O que o vendedor precisa é sempre o mesmo pedido do cliente: *"me manda a nota"* e
*"me manda o boleto"*. Precisa funcionar em três lugares, com o mesmo arquivo:

1. **Posição de Cliente** — abas de Notas fiscais e Títulos a receber.
2. **Rotinas próprias** de Notas de Saída e Títulos a Receber.
3. **Atendimento (WhatsApp)** — anexando o PDF na conversa.

## Decisões (2026-08-21)

| Assunto | Decisão |
|---|---|
| DANFE | O ERP **empurra o XML autorizado**; a plataforma renderiza o DANFE em PDF. |
| Boleto | A plataforma **gera** a ficha de compensação — **Bradesco (237)** na v1. |
| Nosso número | **Vem do ERP** no título. A plataforma **reimprime** boleto já registrado; não numera nem registra no banco. |
| Convênio bancário | **Cadastro próprio por empresa** (`contas_bancarias`), não parâmetro nem payload repetido. |
| Armazenamento | **Disco**, em `uploads/nfe` — mesmo padrão de logo e mídia de WhatsApp. Exige volume persistente. |

Consequências que valem registrar:

- **Só o XML é guardado.** O DANFE é renderizado sob demanda a partir dele: PDF em
  disco seria cache de algo barato de refazer, e desatualizaria se o layout mudasse.
- **Se o ERP mandar `codigoBarras`/`linhaDigitavel` prontos, eles prevalecem.** O
  cálculo local é o caminho normal, mas divergir do que o banco registrou seria pior
  do que não imprimir — quem registrou o boleto foi o ERP.
- **Sem nosso número não há boleto.** A rota responde 409 com o motivo, e a tela não
  oferece o botão. Boleto sem registro não é pagável nas carteiras de hoje.

## Fases

1. **Dados** — `ContaBancaria` (com RLS), campos de boleto em `TituloReceber`, campos
   de XML em `NotaSaida`; rotina/menu `contas-bancarias`.
2. **Contracts** — `conta-bancaria.ts`, extensões de título e nota.
3. **Cadastro** — CRUD de contas bancárias (Admin).
4. **Ingestão** — `POST /integracao/notas-saida/:codigo/xml` e campos de boleto no
   upsert de títulos.
5. **Geradores** — `barcode.ts` (Code128C e 2 de 5 intercalado), `nfe-xml.ts`,
   `danfe-pdf.ts`, `boleto-bradesco.ts`, `boleto-pdf.ts`.
6. **Rotas** — `GET /notas-saida/:id/danfe`, `/xml`, `GET /titulos-receber/:id/boleto`.
7. **Web** — botões de 2ª via na Posição de Cliente e nas duas rotinas.
8. **WhatsApp** — ações `danfe` e `boleto` anexando o PDF na conversa.

## Regra de cobrança em atraso (decidida em 2026-08-21)

O boleto de **título vencido sai com valor atualizado**: saldo + multa
(percentual fixo, uma vez) + juros (percentual ao mês convertido em taxa
diária, pro rata pelos dias de atraso). Os percentuais vêm do convênio
cadastrado — sem percentual, não há encargo, porque inventar multa padrão
cobraria do cliente o que a empresa nunca combinou.

A composição do valor sai impressa nas instruções da ficha (valor original,
multa, juros, total, data da atualização): o cliente precisa entender por que
o valor mudou, senão liga para o vendedor — a ligação que a 2ª via existe para
evitar.

**A emissão para em 30 dias de atraso.** Do 31º dia em diante a rota responde
409 e a tela não oferece o botão (`temBoleto` aplica a mesma regra). Passado
esse prazo a cobrança já costuma estar em outro rito — negativação, protesto,
acordo — e um boleto emitido pela plataforma atropelaria isso.

Consequência técnica: quando há encargo aplicado, o `codigoBarras` registrado
pelo ERP **deixa de prevalecer** e o código é recalculado, porque o registrado
carrega o valor original. O fator de vencimento continua sendo o do vencimento
original — o título é o mesmo, só o valor a pagar mudou.

A aritmética vive em `apps/api/src/modules/titulos-receber/boleto-atualizacao.ts`,
isolada e coberta por teste.

## Rastro no histórico de atendimento do cliente (2026-08-21)

Toda geração e todo envio de 2ª via viram uma **Atividade concluída** ligada ao
cliente — o mesmo mecanismo que o orçamento já usava
(`registrarAtividadeOrcamento`), agora compartilhado em
`apps/api/src/common/atividades/registrar-atividade-documento.ts`. É o que
aparece em CRM › Atividades / Agenda filtrando por cliente.

Não foi criada uma tabela nova de "histórico de atendimento": ela faria o
histórico do cliente morar em dois lugares que divergiriam. `cliente_historico`
continua sendo outra coisa — alteração de **cadastro**, campo a campo.

Eventos: `danfe_gerado`, `danfe_whatsapp`, `xml_baixado`, `boleto_gerado`,
`boleto_whatsapp`. Quem envia pela conversa desliga o registro do service
(`registrarEvento: false`) e grava o evento de **envio** — a mesma convenção do
PDF de orçamento, para a mesma ação não gerar duas linhas.

Três decisões que valem registro:

- **Grava depois de o documento existir.** Se a montagem falhar (409 por XML
  ilegível, por falta de nosso número), o histórico não fica com uma 2ª via que
  ninguém recebeu.
- **A atividade fica na carteira do cliente**: vendedor do documento e, na
  falta dele, o vendedor do cadastro do cliente — não quem por acaso clicou. O
  autor (`createdBy`) continua sendo o usuário logado, que responde pela ação.
- **O registro nunca derruba a entrega.** Cliente sem vendedor cadastrado
  simplesmente não gera atividade: perder o rastro é ruim, negar ao vendedor o
  boleto que o cliente está esperando é pior.

A descrição carrega o que importa para quem lê meses depois — no boleto, a
composição do valor quando houve atraso (original, multa, juros); no DANFE, a
data de emissão, o valor e o aviso de nota cancelada.

O registro de `whatsapp_acoes` continua existindo em paralelo: aquilo é
auditoria do módulo de WhatsApp (o que saiu por qual conversa); isto é o
histórico que o comercial lê no cliente.

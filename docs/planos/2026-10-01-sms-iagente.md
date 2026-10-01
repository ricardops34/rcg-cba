# Plano: envio de SMS pela iAgente

> **Status (01/10/2026): implementado.** Módulo `sms` (envio, webhook de
> status e respostas, aviso automático, estatística), tela Administração > SMS,
> SMS de boleto/cobrança/livre na Posição do Cliente e na 2ª via, senha
> provisória por SMS. Testado em dev: o webhook vinculou a resposta ao envio
> pelo `codigosms`, ignorou a repetição, atualizou o status e gravou no
> histórico; segredo errado deu 404. **Não testado contra a iAgente de
> verdade** (não há token em dev): falta o primeiro envio real.

## Pedido (usuário, 01/10/2026)

Integração de SMS com a iAgente (https://iagente.com.br/docs/api-sms), para:

1. **Cobrança / boleto** — valor, vencimento e linha digitável (SMS não leva
   anexo), para o celular do cadastro do cliente;
2. **Senha provisória** — junto do e-mail, para o celular do vendedor;
3. **Mensagem livre ao cliente** — o vendedor digita, na Posição do Cliente;
4. **Aviso automático de vencimento** — antes e depois do vencimento.

Todo SMS ao cliente **entra no histórico de atendimento** (usuário,
01/10/2026). O de senha vai para o vendedor, não é atendimento de cliente: fica
só no registro de envios.

## API da iAgente (conferida em 01/10/2026)

- `POST https://api.iagentesms.com.br/api/v2/messages`, `Authorization: Bearer
  sk_live_...`, corpo `{ to: "5567999990000", message, client_ref? }`, header
  `Idempotency-Key` opcional. Resposta 201 `{ data: { id, status: "queued",
  credits_charged } }`.
- Erros `{ error: { code, message } }`: 401 token, 402 sem crédito, 403
  escopo/IP, 422 validação ou destinatário bloqueado, 429 limite.
- 160 caracteres por segmento; acima disso cobra mais de um crédito.
- **Webhook** (configurado no painel, GET): status de entrega e **respostas do
  cliente** (`status=Resposta`), com `codigosms` = `client_ref` do envio. É por
  ele que a resposta é vinculada ao envio (pedido do usuário, 01/10/2026).
  Sem assinatura: a URL leva um segredo por empresa (HMAC do
  `JWT_ACCESS_SECRET`), mostrado em Administração > SMS.

## Desenho

- **Configuração por empresa** (Administração > Parâmetros): `SMS_TOKEN`
  (senha). Sem token, SMS não está configurado e as rotas respondem 409 dizendo
  onde configurar.
- **Destinatário:** o celular do cadastro (cliente: `celular`, depois
  `telefone`/`telefone2` se forem celular; vendedor: `telefone`). Só celular
  (11 dígitos com o 9) — fixo não recebe SMS. Sem celular: 409.
- **Texto sem acento** (algumas operadoras trocam o caractere) e com o nome da
  empresa na frente, para o cliente saber quem manda.
- **Registro `sms_envios`** (RLS por empresa): celular, mensagem, motivo,
  cliente/título/vendedor, id e status do provedor, erro, autor. É dele que o
  aviso automático tira "já avisei este título".
- **Rotas** (`/sms`): `titulo/:id` (boleto), `cobranca/:clienteId`,
  `cliente/:clienteId` (mensagem livre) — permissões de quem vê o mesmo dado.
- **Aviso automático:** varredura a cada 30 minutos, **só das 8h às 18h**
  (horário de Campo Grande), **desligada por padrão**
  (`SMS_AVISO_VENCIMENTO_ATIVO`). `SMS_AVISO_DIAS_ANTES` (padrão 2) e
  `SMS_AVISO_DIAS_DEPOIS` (padrão 3); 0 desliga cada um. Um aviso de cada tipo
  por título, no máximo.

## Respostas, estatística e saldo (usuário, 01/10/2026)

- **Respostas do cliente** chegam pelo webhook e ficam em `sms_respostas`,
  vinculadas ao envio (`client_ref` = id do `SmsEnvio`); sem `codigosms`
  (palavra-chave), vale o último envio ao mesmo celular. Cada resposta entra no
  histórico de atendimento do cliente. O webhook repete até 10 vezes: a mesma
  resposta não duplica.
- **Administração > SMS** (rotina `sms`, permissão para os perfis de
  administração): saldo e consumo do mês da iAgente, URL do webhook,
  situação do aviso automático, estatística (enviados, entregues, falhas,
  aguardando, respostas, por motivo, mês a mês) e histórico com filtros de
  ano, mês, motivo e situação, com as respostas embaixo de cada SMS.
- `GET /inbound` da iAgente não tem formato documentado; não é usado.

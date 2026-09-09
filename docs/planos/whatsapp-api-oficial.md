# Plano — WhatsApp API Oficial da Meta (Cloud API), terceiro provedor

> Plano registrado em 2026-09-09. Este documento não representa
> funcionalidade já implementada — nada do que está aqui existe no código
> ainda. Os dois transportes operacionais continuam `zapo`/`zapo-js` e
> `evolution_go`. Retomar por aqui quando a implementação começar.

## 1. Objetivo

Adicionar a WhatsApp Cloud API (oficial da Meta) como terceiro provedor,
coexistindo livremente com zapo-js e Evolution GO — inclusive na mesma
empresa, cada sessão com o seu (ver `docs/whatsapp/README.md`, seção de
transportes). Diferente dos outros dois, é **oficial**: não pareia o WhatsApp
Web ao aparelho, não corre risco de banimento por automação, mas tem regras
próprias que os outros não têm (ver seção 4).

Decisões já confirmadas com o usuário (não reabrir sem motivo novo):

1. **Escopo institucional apenas.** A Cloud API não tem pareamento por QR — é
   um número cadastrado no Business Manager da Meta, não o celular de
   alguém. Só entra para a sessão institucional (`tipo: 'empresa'`); a tela
   de Conversas do vendedor (desenhada 100% em torno de QR) não muda.
2. **Gestão de templates incluída nesta rodada**, não adiada. Fora da janela
   de 24h da conversa, a Meta só aceita mensagem via template pré-aprovado —
   texto livre é recusado pela própria Meta.

## 2. Onde a abstração já existe

`WhatsappProvider`
([whatsapp-provider.ts](../../apps/api/src/modules/whatsapp/providers/whatsapp-provider.ts))
isola o resto do módulo (RBAC, escopo de vendedor, persistência, retenção,
privacidade) de qual provedor está do outro lado — é o mesmo contrato que
`zapo.provider.ts` e `evolution-go.provider.ts` já implementam. A Cloud API é
a terceira implementação, não uma exceção arquitetural.

`WhatsappSessao.transporte` é uma coluna **por sessão**, não um valor único
da empresa (`WhatsappConfig.transporte` é só o padrão) — é por isso que
"vendedor A no zapo, vendedor B na Evolution GO, institucional na Cloud API,
tudo ao mesmo tempo" já funciona sem redesenho, uma vez implementado o
terceiro provider.

## 3. O que a documentação oficial da Meta confirma

(Fontes ao final — consultadas em 2026-09-09, conferir de novo antes de
implementar: é uma plataforma que muda.)

- **Sem pareamento.** Basta Phone Number ID + token de acesso permanente
  válidos — não existe "conectar" no sentido de QR. `iniciar`/`pareamento`
  do novo provider são triviais: validam a credencial numa chamada à Graph
  API e já devolvem `conectada`.
- **Janela de 24h.** Toda mensagem recebida reabre uma janela de 24h em que
  texto livre é permitido. Fora dela, só `type: "template"` é aceito —
  recusa da própria Meta, não uma regra nossa.
- **Envio de template:**
  ```json
  POST /{phone-number-id}/messages
  {
    "messaging_product": "whatsapp",
    "to": "+55...",
    "type": "template",
    "template": {
      "name": "...",
      "language": { "code": "pt_BR" },
      "components": [{ "type": "body", "parameters": [...] }]
    }
  }
  ```
- **Templates têm `status`:** `APPROVED` (única enviável), `PENDING_REVIEW`,
  `REJECTED`, `PAUSED`, `DISABLED`.
- **Webhook tem duas partes:**
  - **Handshake de verificação** — `GET` com `hub.mode=subscribe`,
    `hub.verify_token`, `hub.challenge`; a rota confere o token e ecoa o
    challenge. Sem equivalente na Evolution GO.
  - **Eventos** — `POST` assinado em `X-Hub-Signature-256: sha256=<hmac>`,
    HMAC-SHA256 do **corpo bruto** com o App Secret. Exige acesso ao body cru
    antes do parser JSON — NestJS não expõe isso por padrão.
  - Payload: `entry[].changes[].value.{messaging_product, metadata,
    contacts[], messages[]}`; mensagem tem `from, id, timestamp, type,
    text.body`.
- **Coexistência "oficial" da Meta (app WhatsApp Business + Cloud API) é
  outra coisa** — não confundir. Aquele recurso liga o **app oficial de
  celular** da Meta à Cloud API; não tem relação com migrar um número que
  hoje está no zapo-js/Evolution GO. Ver `docs/whatsapp/README.md` se essa
  dúvida voltar.

## 4. Mudanças previstas (nível de arquivo, a confirmar em plano de execução)

### Schema — `apps/api/prisma/schema.prisma`

**`WhatsappConfig`**, novos campos (mesmo padrão de `evolutionUrl`/
`evolutionApiKeyCifrada`: cifrado com `cifrarSegredo` de `whatsapp-cripto.ts`,
nunca devolvido por leitura):

```prisma
cloudApiPhoneNumberId        String?
cloudApiBusinessAccountId    String?
cloudApiAccessTokenCifrada   String? @db.Text
cloudApiAppSecretCifrada     String? @db.Text  // assina o webhook
cloudApiWebhookVerifyToken   String?           // não é segredo de tráfego
```

**`WhatsappTemplate`** (novo model — mirror local dos templates aprovados,
pra tela escolher sem chamar a Meta a cada clique):

```prisma
model WhatsappTemplate {
  id             String   @id @default(uuid())
  empresaId      String
  metaId         String
  nome           String
  idioma         String
  categoria      String   // MARKETING | UTILITY | AUTHENTICATION
  status         String   // APPROVED | PENDING_REVIEW | REJECTED | PAUSED | DISABLED
  componentes    Json     // como veio da Meta
  sincronizadoEm DateTime @default(now())

  @@unique([empresaId, metaId])
  @@map("whatsapp_templates")
}
```

RLS na mesma migration que cria a tabela — regra do projeto
(`apps/api/prisma/migrations/README.md`). `whatsapp_config` já tem RLS hoje
(confirmado na baseline); os campos novos não mudam isso.

### Backend novo

- `providers/cloud-api.client.ts` — casca HTTP fina pra Graph API
  (`https://graph.facebook.com/v21.0/...`, `Authorization: Bearer`), mesmo
  papel de `evolution-go.client.ts`.
- `providers/cloud-api.provider.ts` — `implements WhatsappProvider`:
  - `iniciar`/`pareamento`: sem QR, valida credencial e já devolve conectada.
  - `desconectar`/`sairDoWhatsapp`/`removerInstancia`: só limpam estado
    local — o número continua cadastrado no Business Manager independente
    do que este sistema faz.
  - `enviarTexto`/`enviarArquivo`: checam a janela de 24h (última mensagem
    de entrada do contato) antes de mandar; fechada, erro tipado que a
    camada de cima reconhece.
  - `enviarTemplate` — método novo, **opcional** na interface
    `WhatsappProvider` (só a Cloud API implementa; os outros dois não
    precisam saber que existe).
  - `listarContatos`/`listarConversas`/`obterFotoContato`/`sincronizarAgenda`/
    `importarHistorico`: no-op documentado — a Cloud API não expõe nada
    disso.
  - `sincronizarTemplates(empresaId)`: `GET
    /{businessAccountId}/message_templates`, upsert em `WhatsappTemplate`
    por `metaId`.
- `whatsapp-provider.service.ts` → `exigirConfiguracao`: branch `cloud_api`
  exigindo os quatro campos novos do config.
- `whatsapp-cloud-api.controller.ts` (novo, ao lado de
  `whatsapp-evolution.controller.ts`) — `@ApiExcludeController`, sem
  `JwtAuthGuard`:
  - `GET /whatsapp/cloud-api/webhook/:empresaId` — handshake.
  - `POST /whatsapp/cloud-api/webhook/:empresaId` — verifica assinatura
    (`timingSafeEqual`, mesmo padrão do controller da Evolution GO), roteia
    por tipo de evento, sempre 200 pro que não tem tratamento.
  - Corpo bruto: `main.ts` precisa de
    `NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true
    })` — opção nativa do Nest, não afeta as demais rotas.
- `WhatsappConversasService.enviar()` — capturar o erro de janela fechada do
  provider, devolver algo que o frontend reconheça (não um 500 genérico).
  Novo `enviarTemplate(...)`, mesmo contorno de `enviar`.
- Contracts (`packages/contracts/src/whatsapp.ts`): `cloud_api` entra em
  `WHATSAPP_TRANSPORTES_IMPLEMENTADOS`; campos novos no config (booleano de
  presença pros dois cifrados, nunca o valor); `whatsappTemplateSchema`;
  `whatsappEnviarTemplateSchema`.
- `whatsapp.controller.ts`: `GET /whatsapp/config/templates`, `POST
  /whatsapp/config/templates/sincronizar`, rota de enviar-template — escopo
  da empresa ativa (não entra no conjunto `:empresaId` de plataforma que já
  existe pra pareamento institucional; templates são config da própria
  empresa).

### Frontend

- Aba "API Oficial" em `/admin/whatsapp`: troca `ProviderEmPreparacao` por
  formulário real (Phone Number ID, Business Account ID, Access Token, App
  Secret, Webhook Verify Token) + URL do webhook pra colar no painel da Meta
  + lista de templates sincronizados com status.
- `institucional-config.tsx`: `PROVEDORES_ESCOLHIVEIS` ganha `'cloud_api'`.
- Composer da conversa institucional: ao receber "janela fechada", trocar
  campo de texto por seletor de template + variáveis.

## 5. Verificação (quando for implementar)

1. Build de API e web (`docker build ... :check` — sem toolchain Node fora
   dos containers neste ambiente).
2. Precisa de conta de desenvolvedor Meta + número de teste do Business
   Manager — passo manual do usuário, fora do que dá pra automatizar aqui.
3. Handshake: `curl` no `GET .../webhook/:empresaId` com
   `hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=123` devolve
   `123` em texto puro.
4. Mensagem real → webhook grava a conversa (mesmo caminho de
   `WhatsappConversasService.receber`).
5. Dentro da janela: texto livre funciona. Janela fechada: UI oferece
   template, envio por template funciona.
6. zapo-js/Evolution GO continuam sem regressão — a interface
   `WhatsappProvider` não perde nenhum contrato dos dois.

## Fontes (documentação oficial da Meta, consultadas em 2026-09-09)

- [Set up webhooks — WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/)
- [Message Templates — WhatsApp Business Management API](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates)
- [About the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)
- [Onboard WhatsApp Business app users (coexistence, não confundir)](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)

# Integração WhatsApp

Esta pasta documenta o Atendimento por WhatsApp da plataforma. Existem **três
transportes implementados**, e a empresa usa um de cada vez:

| Transporte | O que é | Quem mantém a sessão | Pareamento |
|---|---|---|---|
| `zapo` | Biblioteca `zapo-js` dentro do `apps/whatsapp-worker` | Processo próprio da plataforma | QR |
| `evolution_go` | Gateway REST externo (Evolution GO) | O gateway, no banco dele | QR |
| `cloud_api` | API Oficial da Meta (Graph API) | A Meta | **nenhum** — credencial no Business Manager |

> **Os dois primeiros são não oficiais.** Eles pareiam o WhatsApp Web ao
> aparelho, como um computador conectado: mudanças no protocolo podem
> interromper sessões e o número pode ser restringido ou banido. Use número
> dedicado e avalie o risco operacional.
>
> A `cloud_api` não tem esse risco — é a plataforma oficial —, mas tem outras
> regras: **janela de 24 horas** (fora dela só sai template pré-aprovado) e
> cobrança por conversa.

## Documentos

- [Arquitetura e fluxos do `zapo-js`](./integracao-zapo-js.md)
- [Integração com Evolution GO](./integracao-evolution-go.md)
- [Plano de integração unificada: Zapo e Evolution GO](../planos/whatsapp-integracao-unificada.md)
- [Plano original do terceiro provedor: API Oficial da Meta](../planos/whatsapp-api-oficial.md) — histórico; o transporte **está implementado** (ver abaixo)
- [Referência de endpoints](./endpoints.md)
- [Configuração, implantação e diagnóstico](./operacao.md)
- [Plano funcional original](../planos/whatsapp-vendedor.md)

## Resumo da arquitetura

```text
Navegador
   │ HTTPS + JWT/RBAC
   ▼
API NestJS ─────────────────────── PostgreSQL / schema public
   │                                 dados comerciais + RLS
   │  WhatsappProviderService escolhe o provedor pelo
   │  `transporte` da **sessão**
   │
   ├── ZapoProvider ──────────────────────────────────────┐
   │      Bearer WHATSAPP_WORKER_TOKEN                    │
   │      ▼                                               │
   │   whatsapp-worker ─────── PostgreSQL / schema whatsapp
   │      zapo-js                 chaves Signal e estado
   │      ▼                                               │
   │   WhatsApp ◄─────────────────────────────────────────┘
   │
   ├── EvolutionGoProvider
   │      HTTP + chave de instância
   │      ▼
   │   Evolution GO ─────────── PostgreSQL / banco `evolution`
   │      ▼                        sessões e estado técnico
   │   WhatsApp
   │
   └── CloudApiProvider
          HTTPS + token de acesso
          ▼                       sem sessão nossa: quem guarda é a Meta
       Graph API (Meta)
          ▼
       WhatsApp

Evolution GO ── webhook por instância ──► API NestJS
Meta ────────── webhook assinado (HMAC) ─► API NestJS
```

**A restrição de réplica única vale para os dois transportes não oficiais**, e
por motivos diferentes: no worker porque cada sessão mantém WebSocket e estado
em memória; no gateway porque duas instâncias com as mesmas sessões disputam a
conexão e derrubam uma à outra.

A `cloud_api` não tem essa restrição — não há sessão nossa a manter, só chamadas
HTTP à Meta.

## Escolha do provedor

A configuração da empresa (`whatsapp_config.transporte`) define o padrão, mas
**cada sessão guarda o transporte com que foi conectada**. É o que impede que
trocar o padrão faça a API falar Evolution com uma instância que ainda vive no
worker. Consequências práticas:

- trocar o transporte não migra ninguém: cada vendedor precisa parear de novo
  (indo para `cloud_api` não há pareamento — o que falta ali é a credencial no
  Business Manager);
- ao reparear em outro provedor, a sessão anterior recebe logout antes — uma
  instância órfã continuaria pareada ao celular do vendedor recebendo mensagens
  que a API já não escuta;
- o histórico de conversas não se move: ele é da plataforma, não do provedor.

## Componentes principais

| Componente | Responsabilidade |
|---|---|
| `apps/web` | Atendimento, QR Code, agenda, mensagens e configuração administrativa |
| `WhatsappController` | API autenticada para navegador, com JWT e RBAC |
| `WhatsappProviderService` | Resolve o contexto da sessão e roteia para o provedor dela |
| `ZapoProvider` | Adapta o protocolo do `whatsapp-worker` ao contrato de provedor |
| `EvolutionGoProvider` | Cliente da Evolution GO: instâncias, envio, agenda e mídia tardia |
| `CloudApiProvider` | Cliente da Graph API da Meta: envio, templates e janela de 24 h |
| `WhatsappInternoController` | Callbacks privados do worker para a API |
| `WhatsappEvolutionController` | Webhook da Evolution GO, autenticado por segredo de instância |
| `WhatsappCloudApiController` | Webhook da Meta, com verificação e assinatura HMAC do corpo bruto |
| `WhatsappSessaoService` | Sessões, pareamento, estado e escopo por vendedor |
| `WhatsappConversasService` | Conversas, mensagens, arquivos, reações e recibos |
| `WhatsappAgendaService` | Leitura transitória da agenda e cruzamento com clientes |
| `WhatsappAgendamentoService` | Fila e envio periódico de mensagens agendadas |
| `WhatsappAcoesService` | Orçamento, DANFE, boleto, títulos, notas e atividades |
| `WhatsappWorkerClient` | Cliente HTTP da API para o worker |
| `apps/whatsapp-worker` | Processo único que mantém as conexões ativas |
| `ZapoTransport` | Adaptador isolado da biblioteca `zapo-js` |
| `@zapo-js/store-postgres` | Persistência das chaves e do estado do protocolo |

## Dependências

O worker utiliza:

```json
{
  "zapo-js": "^1.7.1",
  "@zapo-js/store-postgres": "^1.1.0"
}
```

O runtime precisa de Node.js 22. Apesar de a biblioteca declarar Node
`>=20.9.0`, a implementação usa o `WebSocket` global disponível no runtime
adotado pelo projeto a partir do Node 22.

## A API Oficial da Meta (`cloud_api`) **[implementada; corrigido em 2026-09-21]**

> Esta seção dizia, até 2026-09-21, que *"não existe adaptador funcional para a
> API Oficial"* e que *"a API recusa a seleção desse transporte"*. **As duas
> afirmações estavam erradas** — o adaptador existe desde antes disso, com
> provedor, webhook, configuração e tela. A frase sobreviveu porque nenhum
> documento desta pasta carregava data de verificação; o `runbook-operacao.md`
> já descrevia o transporte enquanto isto aqui o negava.

| Peça | Onde |
|---|---|
| Provedor | `providers/cloud-api.provider.ts` |
| Cliente da Graph API | `providers/cloud-api.client.ts` |
| Webhook | `whatsapp-cloud-api.controller.ts` |
| Roteamento por sessão | `providers/whatsapp-provider.service.ts` |

### O que muda em relação aos outros dois

**Não há pareamento.** Quem autentica é o Phone Number ID mais o token de
acesso, cadastrados no Business Manager — não existe QR nem aparelho. Por
consequência, não existe "sessão que cai": o que falha é credencial, não
conexão.

**A janela de 24 horas é da Meta, não nossa.** Passadas 24 h da última mensagem
do cliente, só sai **template pré-aprovado**. A API devolve `409` com o código
`WHATSAPP_JANELA_FECHADA`, e a tela troca o campo de texto por um seletor de
template em vez de mostrar erro genérico.

**Dois segredos distintos:** o token de acesso fala pelo número; o App Secret
assina o webhook (HMAC-SHA256 do corpo bruto). Os dois vão cifrados e nenhuma
rota de leitura os devolve — nem em rastro de últimos dígitos, diferente da
chave da Evolution GO, porque o token sozinho já fala pela empresa inteira.

### O que a plataforma oficial simplesmente não tem

| Recurso | Situação |
|---|---|
| Enviar reação | **Não existe** na Graph API. O provider ignora em silêncio: a mensagem chega intacta, só sem a reação. Receber, recebe |
| Agenda de contatos | Não existe — não há aparelho de onde ler |
| Conversas do aparelho | Idem |

### Templates

`sincronizarTemplates` traz os aprovados da conta e grava em
`WhatsappTemplate`. Exige o número institucional conectado na API Oficial — é
dela que vem a lista.

## O que ainda precisa de validação em campo

A Evolution GO foi implementada a partir da documentação do projeto dela, e o
próprio documento de integração marca alguns comportamentos como divergentes
entre versões. Antes de mover produção para lá, exercite com uma instância
real: resposta citada, reação recebida, mídia baixada depois do vínculo, áudio
PTT, recibos, `@lid`, restauração após reinício e a lista de conversas do
aparelho. Ver a seção "Pontos que exigem prova de conceito" em
[integracao-evolution-go.md](./integracao-evolution-go.md).

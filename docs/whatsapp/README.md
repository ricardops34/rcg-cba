# Integração WhatsApp

Esta pasta documenta o Atendimento por WhatsApp da plataforma. Existem **dois
transportes implementados**, e a empresa usa um de cada vez:

| Transporte | O que é | Quem mantém a sessão |
|---|---|---|
| `zapo` | Biblioteca `zapo-js` dentro do `apps/whatsapp-worker` | Processo próprio da plataforma |
| `evolution_go` | Gateway REST externo (Evolution GO) | O gateway, no banco dele |

`cloud_api` continua no enum do banco, mas não tem adaptador: selecioná-lo é
recusado pela API.

> Nenhum dos dois usa a WhatsApp Business Cloud API da Meta. Os dois pareiam o
> WhatsApp Web ao aparelho do vendedor, como um computador conectado. Mudanças
> no protocolo podem interromper sessões e o número pode ser restringido ou
> banido. Em produção, use número dedicado e avalie o risco operacional.

## Documentos

- [Arquitetura e fluxos do `zapo-js`](./integracao-zapo-js.md)
- [Integração com Evolution GO](./integracao-evolution-go.md)
- [Plano de integração unificada: Zapo e Evolution GO](../planos/whatsapp-integracao-unificada.md)
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
   └── EvolutionGoProvider
          HTTP + chave de instância
          ▼
       Evolution GO ─────────── PostgreSQL / banco `evolution`
          ▼                        sessões e estado técnico
       WhatsApp

Evolution GO ── webhook por instância ──► API NestJS
```

Nos dois casos vale a mesma restrição de réplica única: no worker porque cada
sessão mantém WebSocket e estado em memória; no gateway porque duas instâncias
com as mesmas sessões disputam a conexão e derrubam uma à outra.

## Escolha do provedor

A configuração da empresa (`whatsapp_config.transporte`) define o padrão, mas
**cada sessão guarda o transporte com que foi conectada**. É o que impede que
trocar o padrão faça a API falar Evolution com uma instância que ainda vive no
worker. Consequências práticas:

- trocar o transporte não migra ninguém: cada vendedor precisa parear de novo;
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
| `WhatsappInternoController` | Callbacks privados do worker para a API |
| `WhatsappEvolutionController` | Webhook da Evolution GO, autenticado por segredo de instância |
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

## Estado de outros transportes

O enum da aplicação também contém `cloud_api`, mas não existe adaptador
funcional para a API Oficial. A API recusa a seleção desse transporte em vez de
deixar o vendedor descobrir na tela de pareamento que nada acontece.

## O que ainda precisa de validação em campo

A Evolution GO foi implementada a partir da documentação do projeto dela, e o
próprio documento de integração marca alguns comportamentos como divergentes
entre versões. Antes de mover produção para lá, exercite com uma instância
real: resposta citada, reação recebida, mídia baixada depois do vínculo, áudio
PTT, recibos, `@lid`, restauração após reinício e a lista de conversas do
aparelho. Ver a seção "Pontos que exigem prova de conceito" em
[integracao-evolution-go.md](./integracao-evolution-go.md).

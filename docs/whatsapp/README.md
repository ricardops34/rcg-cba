# Integração WhatsApp com `zapo-js`

Esta pasta documenta a implementação existente do Atendimento por WhatsApp da
plataforma. O transporte funcional atual é o `zapo-js`, uma integração não
oficial baseada em sessão pareada por QR Code, semelhante ao WhatsApp Web.

> Esta integração não usa a WhatsApp Business Cloud API da Meta. Mudanças no
> protocolo podem interromper sessões e o número pode ser restringido ou banido.
> Em produção, use número dedicado e avalie o risco operacional.

## Documentos

- [Arquitetura e fluxos](./integracao-zapo-js.md)
- [Análise e proposta de integração com Evolution GO](./integracao-evolution-go.md)
- [Plano de integração unificada: Zapo e Evolution GO](../planos/whatsapp-integracao-unificada.md)
- [Referência de endpoints](./endpoints.md)
- [Configuração, implantação e diagnóstico](./operacao.md)
- [Plano funcional original](../planos/whatsapp-vendedor.md)

## Resumo da arquitetura

```text
Navegador
   │ HTTPS + JWT/RBAC
   ▼
API NestJS ─────────────── PostgreSQL / schema public
   │ Bearer WHATSAPP_WORKER_TOKEN      dados comerciais + RLS
   ▼
whatsapp-worker ────────── PostgreSQL / schema whatsapp
   │ zapo-js                         chaves Signal e estado da sessão
   ▼
WhatsApp
```

O worker é um processo separado porque cada sessão mantém WebSocket e estado em
memória. Ele deve operar com **uma única réplica**. Duas réplicas restaurando a
mesma sessão podem disputar a conexão e derrubar uma à outra.

## Componentes principais

| Componente | Responsabilidade |
|---|---|
| `apps/web` | Atendimento, QR Code, agenda, mensagens e configuração administrativa |
| `WhatsappController` | API autenticada para navegador, com JWT e RBAC |
| `WhatsappInternoController` | Callbacks privados do worker para a API |
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
funcional para a API Oficial. Evolution GO também não possui cliente, webhook
ou transporte implementado. A única integração operacional descrita aqui é
`zapo`/`zapo-js`.

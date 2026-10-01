# Integração WhatsApp

Esta pasta documenta o Atendimento por WhatsApp da plataforma comercial multi-tenant.

A plataforma padronizou a integração no **Gateway Evolution GO** como transporte único.

O Gateway Evolution GO oferece suporte a dois modos de operação:
1. **Não Oficial (WhatsApp Web / Baileys via QR Code)**: cada vendedor ou a empresa conecta o WhatsApp Web do aparelho pelo QR Code gerado pelo gateway.
2. **Oficial (WhatsApp Cloud API da Meta via Evolution GO)**: conexão oficial pela infraestrutura da Meta através do gateway Evolution GO.

## Ativação do canal por empresa

Assim como no **E-mail** (`EMAIL_ATIVO`) e no **SMS** (`SMS_ATIVO`), o canal do WhatsApp possui controle de ativação no nível da empresa (`ativo: boolean` / `WHATSAPP_ATIVO`).

Na tela **Administração > WhatsApp** (`/admin/whatsapp`), o administrador ativa ou desativa o serviço pelo switch principal no topo da página. Quando desativado:
- Sessões não iniciam novos pareamentos;
- Envio e recebimento de mensagens são suspensos;
- Telas de atendimento e envio rápido informam que o WhatsApp está desabilitado na empresa.

## Documentos

- [Integração com Gateway Evolution GO](./integracao-evolution-go.md)
- [Referência de endpoints](./endpoints.md)
- [Configuração, implantação e diagnóstico](./operacao.md)
- [Arquivo de referência histórica do zapo-js (legado)](./integracao-zapo-js.md)
- [Plano de integração unificada](../planos/whatsapp-integracao-unificada.md)
- [Plano funcional original](../planos/whatsapp-vendedor.md)

## Resumo da arquitetura

```text
Navegador (Vendedor / Administrador)
   │ HTTPS + JWT/RBAC
   ▼
API NestJS ──────────────────────── PostgreSQL / schema public
   │                                  dados comerciais + RLS por empresa
   │  WhatsappProviderService
   ▼
EvolutionGoProvider
   │  HTTP REST + chave administrativa (GLOBAL_API_KEY) / token da instância
   ▼
Gateway Evolution GO ────────────── PostgreSQL / banco `evolution`
   │                                  sessões, credenciais e estado técnico
   ├─► Modo Não Oficial (Baileys / QR Code) ──► WhatsApp Web
   └─► Modo Oficial (Cloud API Meta) ──────────► WhatsApp Business Platform (Meta)

Gateway Evolution GO ── webhook por instância ──► API NestJS
   (POST /api/v1/whatsapp/evolution/webhook/:empresaId/:sessaoId)
```

## Componentes principais

| Componente | Responsabilidade |
|---|---|
| `apps/web` | Atendimento, QR Code, agenda, envio rápido, mensagens e configuração administrativa (`/admin/whatsapp`) |
| `WhatsappController` | Endpoints da API para o frontend: sessões, mensagens, contatos, agenda e ações comerciais |
| `WhatsappEvolutionController` | Webhook de retorno da Evolution GO (`/api/v1/whatsapp/evolution/webhook/:empresaId/:sessaoId`), validado por segredo de webhook |
| `WhatsappProviderService` | Resolve a configuração e delega as operações ao `EvolutionGoProvider` |
| `EvolutionGoProvider` | Implementação do provedor de WhatsApp que se comunica via HTTP com o Gateway Evolution GO |
| `EvolutionGoClient` | Cliente HTTP com criptografia de credenciais, timeout e tratamento de resposta do gateway |
| `WhatsappConfigService` | Gestão da configuração por tenant (ativação, URL, chave cifrada, DDD, retenção) |
| `WhatsappSessaoService` | Gerenciamento de sessões (vendedor ou institucional), pareamento e desconexão |
| `WhatsappConversasService` | Persistência de conversas, mensagens, mídias, recibos e reações |
| `WhatsappAgendaService` | Leitura da agenda de contatos e correlação com clientes da empresa |
| `WhatsappAgendamentoService` | Fila e processamento de mensagens agendadas |
| `WhatsappAcoesService` | Disparos comerciais (orçamentos, pedidos, boletos, notas, atividades) |

## Histórico de simplificação

Anteriormente a plataforma suportava múltiplos transportes heterogêneos (`zapo-js` via `whatsapp-worker` interno e chamadas diretas à Graph API da Meta via `cloud_api`). Ambos foram unificados e substituídos pelo **Gateway Evolution GO**, que concentra a manutenção de sessões, websockets, criptografia e integração com a Meta em um serviço especializado e dedicado.

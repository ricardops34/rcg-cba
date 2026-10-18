# whatsapp — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `whatsapp`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Atendimento por WhatsApp integrado ao CRM, sobre o gateway **Evolution GO** (transporte
único desde 01/10/2026; `zapo` e `cloud_api` ficaram no enum e em colunas legadas).
Dois tipos de sessão:

| Sessão | `tipo` | Dono | IA |
|---|---|---|---|
| Aparelho do vendedor | `vendedor` | vendedor + usuário que pareou | nenhuma: conversa humana |
| Número institucional | `empresa` | ninguém (`vendedorId` nulo) | **triagem** atende cliente/desconhecido e funcionário, com catálogos separados |

Blocos funcionais:

- **Recebimento** (`WhatsappEvolutionController` → `WhatsappConversasService.receber`):
  webhook autenticado por segredo da instância, grava contato, conversa e mensagem,
  baixa a mídia depois de gravar e registra o atendimento no histórico do cliente.
- **Atendimento** (`WhatsappConversasService`): lista, mensagens, envio (texto, mídia,
  interativo, template), edição, exclusão, reação, presença, vínculo com cliente,
  iniciar conversa, assumir/encerrar no institucional, indicadores, sugestão de resposta.
- **Ações na conversa** (`WhatsappAcoesService`): títulos, boleto, DANFE, notas,
  orçamentos, fichas técnicas, agendar visita. Delega aos services das telas.
- **Triagem por IA** (`triagem/`): cliente ou desconhecido (13 ferramentas, só
  `registrar_lead` grava) e funcionário pareado por código (8 ferramentas, só leitura).
- **Sessões** (`WhatsappSessaoService`): parear, desconectar, reconectar, estado,
  aceite, administração (limpar histórico, excluir instância, importar histórico).
- **Agendamento** de mensagens, **recado interno** para a equipe, **inatividade** da
  triagem, **agenda do aparelho**, **respostas rápidas**, **configuração**.
- **Gerencial**: Histórico do WhatsApp da equipe, só leitura.

## Responsabilidades

- Atendimento por WhatsApp integrado ao CRM, sobre o gateway **Evolution GO** (transporte
único desde 01/10/2026; `zapo` e `cloud_api` ficaram no enum e em colunas legadas). 🟢
- Dois tipos de sessão:

| Sessão | `tipo` | Dono | IA |
|---|---|---|---|
| Aparelho do vendedor | `vendedor` | vendedor + usuário que pareou | nenhuma: conversa humana |
| Número institucional | `empresa` | ninguém (`vendedorId` nulo) | **triagem** atende cliente/desconhecido e funcionário, com catálogos separados |

Blocos funcionais:

- **Recebimento** (`WhatsappEvolutionController` → `WhatsappConversasService.receber`):
  webhook autenticado por segredo da instância, grava contato, conversa e mensagem,
  baixa a mídia depois de gravar e registra o atendimento no histórico do cliente. 🟢
- - **Atendimento** (`WhatsappConversasService`): lista, mensagens, envio (texto, mídia,
  interativo, template), edição, exclusão, reação, presença, vínculo com cliente,
  iniciar conversa, assumir/encerrar no institucional, indicadores, sugestão de resposta. 🟢
- - **Ações na conversa** (`WhatsappAcoesService`): títulos, boleto, DANFE, notas,
  orçamentos, fichas técnicas, agendar visita. 🟢
- Delega aos services das telas. 🟢
- - **Triagem por IA** (`triagem/`): cliente ou desconhecido (13 ferramentas, só
  `registrar_lead` grava) e funcionário pareado por código (8 ferramentas, só leitura). 🟢
- - **Sessões** (`WhatsappSessaoService`): parear, desconectar, reconectar, estado,
  aceite, administração (limpar histórico, excluir instância, importar histórico). 🟢
- - **Agendamento** de mensagens, **recado interno** para a equipe, **inatividade** da
  triagem, **agenda do aparelho**, **respostas rápidas**, **configuração**. 🟢
- - **Gerencial**: Histórico do WhatsApp da equipe, só leitura. 🟢

## Regras de Negócio

- **RN-WHAT-01 (3.1 Webhook da Evolution GO):** Empresa e sessão vêm na URL, porque com RLS a API não acharia a sessão sem o tenant. 🟢
- **RN-WHAT-02 (3.2 `receber` — gravação da mensagem):** 1. Descarta grupo (`@g.us`), lista de transmissão, status e canal (`@newsletter`). 🟢
- **RN-WHAT-03 (3.3 Vínculo automático com cliente — `casarCliente`):** Na criação do contato: compara os **últimos 8 dígitos** do telefone com `telefone`, 🟢
- **RN-WHAT-04 (3.4 Escopo de leitura e escrita):** **Atendimento** (`filtroSessao` / `conversaNoEscopo`): só a sessão do usuário logado: 🟢
- **RN-WHAT-05 (3.5 Triagem do institucional):** `WhatsappTriagemService.processar` nunca lança: falha vira log e `paraFila` (a conversa 🟢
- **RN-WHAT-06 (3.6 Ciclo do institucional):** `bot` → `aguardando` (direcionada) → `humano` (`assumir`, só sessão `empresa`, não em 🟢
- **RN-WHAT-07 (3.7 Rotinas agendadas):** **Mensagem agendada** (`WhatsappAgendamentoService`, a cada 60 s): autorizada na 🟢
- **RN-WHAT-08 (3.8 Exclusão de histórico):** `apagar-conversas.ts`: ponto único, atrás de `whatsapp-config.excluir`. Apaga em cascata 🟢
- **RN-WHAT-09 (3.9 Achados):** 🔴 **A triagem por IA não roda desde 01/10/2026.** O commit `d7d3205` ("evogo") 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Grupo` (Rotas) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `Configuração` (`GET/PUT config`, templates, `testar-gateway`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `Status` (`GET integracao`, `GET meu-numero`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `Recados internos` (`GET/POST/PUT/DELETE recados…`, `PATCH recados/:id/lido`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `Minha sessão` (`GET sessao`, `POST sessao/conectar`, `GET sessao/pareamento`, `DELETE sessao`, foto, `GET sessoes`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `Número institucional` (`config/sessao-empresa…`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `Institucional de outra empresa` (`config/empresas/:empresaId/…`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `Administração de instâncias` (`config/sessoes/:id/{reconectar, conversas, instancia, instancia-e-historico, historico}`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-09 | Execução de `Conversas` (`GET conversas`, `GET conversas/:id(/mensagens,/eventos)`, `POST conversas`, mensagens, interativa, arquivos, template, editar, apagar, reação, presença, vínculo, foto, `lida`, anotações, agendamentos, `assumir`, `encerrar`, `sugerir-resposta`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-10 | Execução de `Ações` (`conversas/:id/acoes/{titulos, notas, danfe, boleto, agendar, orcamentos, orcamento, orcamento/novo, fichas, ficha}`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-11 | Execução de `Agenda do aparelho` (`agenda/{contatos, conversas, sincronizar, importar}`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-12 | Execução de `Gerencial` (`gerencial/{filtros, conversas, conversas/:id/mensagens, conversas/:id/eventos}`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-13 | Execução de `Indicadores` (`atendimento/nao-lidas`, `atendimento/indicadores`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-14 | Execução de `Respostas rápidas` (CRUD `respostas-rapidas`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-15 | Execução de `Webhook` (`POST whatsapp/evolution/webhook/:empresaId/:sessaoId`) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/whatsapp` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/whatsapp` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/whatsapp` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "whatsapp"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "whatsapp"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `whatsapp` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/whatsapp/whatsapp.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/whatsapp.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/whatsapp-evolution.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/whatsapp-conversas.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/whatsapp-sessao.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/whatsapp-acoes.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/whatsapp-agendamento.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/whatsapp-recado.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/whatsapp-agenda.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/whatsapp-config.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/whatsapp-respostas-rapidas.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/whatsapp-cripto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/escopo-whatsapp.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/apagar-conversas.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/mensagem-interativa.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/mensagem-com-autor.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/midia-arquivos.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/foto-perfil-whatsapp.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/dto/whatsapp.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/providers/whatsapp-provider.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/providers/whatsapp-provider.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/providers/evolution-go.provider.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/providers/evolution-go.client.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/triagem/whatsapp-triagem.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/triagem/triagem-prompt.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/triagem/triagem-ferramentas.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/triagem/triagem-ferramentas-funcionario.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/triagem/triagem-funcionario-tools.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/triagem/whatsapp-funcionario.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/triagem/whatsapp-inatividade.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/triagem/ficha-da-empresa.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/triagem/proximo-expediente.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/triagem/telefone-equipe.ts` | Componente central | 🟢 |
| `apps/api/src/modules/whatsapp/triagem/sem-credencial.ts` | Componente central | 🟢 |


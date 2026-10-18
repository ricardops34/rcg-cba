# notificacoes — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `notificacoes`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

O **sino**: uma tabela única (`notificacoes`) endereçada a um usuário. Quem provoca o
fato grava a linha **dentro da própria transação** (`registrarNotificacao`). A única
exceção é o prazo que vence com o tempo (atividade vencida, título vencido), que uma
varredura periódica grava.

## Responsabilidades

- O **sino**: uma tabela única (`notificacoes`) endereçada a um usuário. 🟢
- Quem provoca o
fato grava a linha **dentro da própria transação** (`registrarNotificacao`). 🟢
- A única
exceção é o prazo que vence com o tempo (atividade vencida, título vencido), que uma
varredura periódica grava. 🟢

## Regras de Negócio

- **RN-NOTI-01 (3.1 Deduplicação — `registrarNotificacao`):** Autor = destinatário → não grava. 🟢
- **RN-NOTI-02 (3.2 Atividade vencida):** Atividade aberta, ativa, com vencimento **até o fim de hoje**, de vendedor com login, que 🟢
- **RN-NOTI-03 (3.3 Título vencido — uma linha por cliente):** Agrega no banco por (cliente, usuário do vendedor): quantidade, total, mais antigo e 🟢
- **RN-NOTI-04 (3.4 Achados):** 🟡 **`jaAvisados` cresce sem limite.** A cada 30 min, para cada empresa, carrega 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `feed — GET /notificacoes` (só JWT) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `marcarLida — POST /notificacoes/:id/lida` (só JWT) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `marcarTodasLidas — POST /notificacoes/lidas` (só JWT) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `registrarNotificacao(tx, n)` (—) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `marcarNotificacoesDaOrigem(tx, …)` (—) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `usuarioDoVendedor(tx, …)` (—) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `NotificacoesVarreduraService.varrer` (timer 30 min + uma vez no boot) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/notificacoes` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/notificacoes` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/notificacoes` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "notificacoes"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "notificacoes"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `notificacoes` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/notificacoes/notificacoes.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/notificacoes/notificacoes.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/notificacoes/notificacoes.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/notificacoes/registrar-notificacao.ts` | Componente central | 🟢 |
| `apps/api/src/modules/notificacoes/notificacoes-varredura.service.ts` | Componente central | 🟢 |


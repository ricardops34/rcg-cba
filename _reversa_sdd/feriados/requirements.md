# feriados — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `feriados`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Cadastro dos dias em que a empresa não atende, **por empresa** (RLS, `withTenant`): os municipais mudam de uma cidade para outra. O sistema gera os feriados nacionais do ano; a empresa acrescenta os locais. É dado de apoio para três consumidores: a trava de horário de trabalho (login e cada requisição), o ajuste de datas para o próximo dia útil (atividades, vencimento de título, validade de orçamento, WhatsApp) e a ferramenta `consultar_feriados` do agente interno.

## Responsabilidades

- Cadastro dos dias em que a empresa não atende, **por empresa** (RLS, `withTenant`): os municipais mudam de uma cidade para outra. 🟢
- O sistema gera os feriados nacionais do ano; a empresa acrescenta os locais. 🟢
- É dado de apoio para três consumidores: a trava de horário de trabalho (login e cada requisição), o ajuste de datas para o próximo dia útil (atividades, vencimento de título, validade de orçamento, WhatsApp) e a ferramenta `consultar_feriados` do agente interno. 🟢

## Regras de Negócio

- **RN-FERI-01 (Isolamento Multi-tenant):** Todo acesso aos dados respeita o isolamento por empresa via RLS do PostgreSQL (`PrismaService.withTenant`). 🟢
- **RN-FERI-02 (Consistência Transacional):** Operações de mutação garantem integridade referencial e auditoria de alterações. 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Permissão) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `GET /feriados?ano=` (`visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `GET /feriados/:id` (`visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `POST /feriados` (`cadastrar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `POST /feriados/gerar-nacionais` (`cadastrar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `PATCH /feriados/:id` (`editar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `DELETE /feriados/:id` (`excluir`) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/feriados` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/feriados` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/feriados` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "feriados"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "feriados"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `feriados` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/feriados/feriados.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/feriados/feriados.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/feriados/feriados.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/feriados/dto/feriado.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/feriados/../../common/horario/feriados-nacionais.ts` | Componente central | 🟢 |
| `apps/api/src/modules/feriados/../../common/horario/calendario-util.ts` | Componente central | 🟢 |


# erros — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `erros`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Log de erros da plataforma, lido só pela administração do SaaS. Duas origens: o **servidor** (o `AllExceptionsFilter` global, `@Catch()`, grava 500 e, com o interruptor ligado, também 4xx) e o **navegador** (rede, resposta inválida, erro de JavaScript, promessa rejeitada), que cobre o caso em que a API estava fora e nada chegou nela. Agrupa por assinatura, colapsa rajadas em contador e se limita sozinho por prazo e por teto por empresa.

## Responsabilidades

- Log de erros da plataforma, lido só pela administração do SaaS. 🟢
- Duas origens: o **servidor** (o `AllExceptionsFilter` global, `@Catch()`, grava 500 e, com o interruptor ligado, também 4xx) e o **navegador** (rede, resposta inválida, erro de JavaScript, promessa rejeitada), que cobre o caso em que a API estava fora e nada chegou nela. 🟢
- Agrupa por assinatura, colapsa rajadas em contador e se limita sozinho por prazo e por teto por empresa. 🟢

## Regras de Negócio

- **RN-ERRO-01 (Isolamento Multi-tenant):** Todo acesso aos dados respeita o isolamento por empresa via RLS do PostgreSQL (`PrismaService.withTenant`). 🟢
- **RN-ERRO-02 (Consistência Transacional):** Operações de mutação garantem integridade referencial e auditoria de alterações. 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Guards) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `POST /erros/cliente` (`JwtAuthGuard`, throttle 20/min) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `GET /plataforma/erros` (`JwtAuthGuard` + `PlatformAdminGuard`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `GET /plataforma/erros/resumo` (idem) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `GET /plataforma/erros/ocorrencias?assinatura=` (idem) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `GET / PATCH /plataforma/erros/config` (idem) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `DELETE /plataforma/erros/:assinatura` (idem) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/erros` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/erros` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/erros` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "erros"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "erros"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `erros` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/erros/erros.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/erros/erros.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/erros/plataforma-erros.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/erros/erros-log.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/erros/erros-varredura.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/erros/dto/erro-log.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/erros/../../common/filters/http-exception.filter.ts` | Componente central | 🟢 |


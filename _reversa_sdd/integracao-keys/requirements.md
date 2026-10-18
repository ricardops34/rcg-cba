# integracao-keys — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `integracao-keys`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Administração, **com login de usuário**, de quem pode chamar a API de integração: emitir, listar,
revogar e excluir **chaves de API** da empresa ativa, e o **monitor de endpoints** (ligar/desligar
cada um dos 20 endpoints da integração por empresa, com último uso e total de chamadas).

## Responsabilidades

- Administração, **com login de usuário**, de quem pode chamar a API de integração: emitir, listar,
revogar e excluir **chaves de API** da empresa ativa, e o **monitor de endpoints** (ligar/desligar
cada um dos 20 endpoints da integração por empresa, com último uso e total de chamadas). 🟢

## Regras de Negócio

- **RN-IK-01 (3.1 Emissão da chave):** `itg_` + `randomBytes(30)` em base64url (40 caracteres). Guarda só o **SHA-256** em `chaveHash` 🟢
- **RN-IK-02 (3.2 Isolamento):** `integracao_api_keys` **não tem RLS** (o `ApiKeyGuard` a consulta antes de existir empresa de 🟢
- **RN-IK-03 (3.3 Revogação):** `ativo=false`, `deletedAt` ou `expiraEm` vencido: o `ApiKeyGuard` lê o banco a cada requisição, então 🟢
- **RN-IK-04 (3.4 Monitor):** `listarEndpoints` cruza `CATALOGO_ENDPOINTS_INTEGRACAO` (20 entradas, uma por controller) com 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Permissão) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `GET /integracao-keys/endpoints` (`visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `PATCH /integracao-keys/endpoints/:endpointKey {ativo}` (`editar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `GET /integracao-keys` (`visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `GET /integracao-keys/:id` (`visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `POST /integracao-keys {nome, expiraEm?}` (`cadastrar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `PATCH /integracao-keys/:id {nome?, ativo?, expiraEm?}` (`editar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `DELETE /integracao-keys/:id` (`excluir`) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/integracao-keys` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/integracao-keys` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/integracao-keys` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "integracao-keys"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "integracao-keys"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `integracao-keys` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/integracao-keys/integracao-keys.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/integracao-keys/integracao-keys.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/integracao-keys/integracao-keys.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/integracao-keys/integracao-endpoints.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/integracao-keys/integracao-endpoints.catalogo.ts` | Componente central | 🟢 |
| `apps/api/src/modules/integracao-keys/dto/integracao-api-key.dto.ts` | Componente central | 🟢 |


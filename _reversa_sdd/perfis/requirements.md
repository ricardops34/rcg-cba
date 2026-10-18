# perfis — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `perfis`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

CRUD do catálogo de perfis RBAC (`Perfil`) e das permissões por rotina/ação
(`PerfilPermissao`). Resolve a visibilidade e as travas de edição entre perfil "da
plataforma" (modelo global, `grupoEconomicoId` nulo) e perfil "do grupo econômico"
(cópia/personalização por grupo) — ver 3.1.

## Responsabilidades

- CRUD do catálogo de perfis RBAC (`Perfil`) e das permissões por rotina/ação
(`PerfilPermissao`). 🟢
- Resolve a visibilidade e as travas de edição entre perfil "da
plataforma" (modelo global, `grupoEconomicoId` nulo) e perfil "do grupo econômico"
(cópia/personalização por grupo) — ver 3.1. 🟢

## Regras de Negócio

- **RN-PERF-01 (3.1 Visibilidade perfil-da-plataforma × perfil-do-grupo (`visiveis`)):** `Perfil` não tem RLS — é lido no login, antes de existir empresa ativa na sessão — então 🟢
- **RN-PERF-02 (3.2 Perfil de outro grupo responde 404 (`findOne`, `garantirPodeAlterar`)):** Perfil de um grupo econômico diferente do da empresa ativa não gera 403, gera 404 — 🟢
- **RN-PERF-03 (3.3 Dono do perfil decidido na criação (`create`)):** Administrador da plataforma cria sempre com `grupoEconomicoId: null` (perfil-modelo, 🟢
- **RN-PERF-04 (3.4 Trava de rotina administrativa fora do perfil base (`updatePermissoes`)):** Perfis que não são `sistemaBase` não podem receber permissão (`permitido: true`) para 🟢
- **RN-PERF-05 (3.5 Upsert em lote de permissões (`updatePermissoes`)):** Substitui por upsert (`perfilId_rotinaId_acao` como chave composta) só as combinações 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `findAll(query, user)` (filtros + paginação) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `findOne(id, user)` (id) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `create(input, user)` (dados do perfil) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `update(id, input, user)` (campos) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `remove(id, user)` (id) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `updatePermissoes(id, input, user)` (lista `{rotinaId, acao, permitido}`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `visiveis(user) (privado)` (user) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `garantirPodeAlterar(id, user) (privado)` (id, user) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-09 | Execução de `grupoDoAtor(user) (privado)` (user) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/perfis` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/perfis` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/perfis` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "perfis"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "perfis"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `perfis` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/perfis/perfis.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/perfis/perfis.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/perfis/perfis.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/perfis/dto/perfil.dto.ts` | Componente central | 🟢 |


# suporte-acesso — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `suporte-acesso`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

**Consentimento do cliente para o suporte da plataforma**: o administrador da empresa
concede uma liberação temporária (1–72 h, com motivo) para a equipe da plataforma
operar no ambiente dela; cada requisição do suporte nesse período fica num **log de
auditoria** (método, rota, corpo até 2000 caracteres, IP, navegador), visível à
empresa. Sem liberação vigente, o guard deveria **bloquear** o administrador da
plataforma no ambiente do cliente.

## Responsabilidades

- **Consentimento do cliente para o suporte da plataforma**: o administrador da empresa
concede uma liberação temporária (1–72 h, com motivo) para a equipe da plataforma
operar no ambiente dela; cada requisição do suporte nesse período fica num **log de
auditoria** (método, rota, corpo até 2000 caracteres, IP, navegador), visível à
empresa. 🟢
- Sem liberação vigente, o guard deveria **bloquear** o administrador da
plataforma no ambiente do cliente. 🟢

## Regras de Negócio

- **RN-SA-01 (3.1 Concessão):** `validoAte = agora + duracaoHoras`. Uma vigente por vez: conceder revoga as anteriores 🟢
- **RN-SA-02 (3.2 O guard global (`SuporteAcessoGuard`)):** Para cada requisição: sem `request.user` → libera; usuário que não administra a 🟢
- **RN-SA-03 (3.3 Achados):** ✅ **Corrigido no lote de 2026-10-16** (virou interceptor, que roda depois do JwtAuthGuard). Achado original: 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Permissão) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `GET /suporte-acesso/ativo` (só JWT) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `POST /suporte-acesso/conceder {motivo, duracaoHoras}` (`empresa.editar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `POST /suporte-acesso/revogar/:id` (`empresa.editar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `GET /suporte-acesso/historico` (só JWT) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `GET /suporte-acesso/logs` (só JWT) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/suporte-acesso` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/suporte-acesso` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/suporte-acesso` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "suporte-acesso"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "suporte-acesso"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `suporte-acesso` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/suporte-acesso/suporte-acesso.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/suporte-acesso/suporte-acesso.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/suporte-acesso/suporte-acesso.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/suporte-acesso/../../common/guards/suporte-acesso.guard.ts` | Componente central | 🟢 |


# recuperacao-senha — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `recuperacao-senha`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

"Esqueci minha senha" por **link de uso único de 30 minutos** enviado por e-mail. Rotas
públicas, como o login; roda no "modo sistema" do papel `plataforma_app` para ler
`usuarios`/`empresas`.

## Responsabilidades

- "Esqueci minha senha" por **link de uso único de 30 minutos** enviado por e-mail. 🟢
- Rotas
públicas, como o login; roda no "modo sistema" do papel `plataforma_app` para ler
`usuarios`/`empresas`. 🟢

## Regras de Negócio

- **RN-RS-01 (Isolamento Multi-tenant):** Todo acesso aos dados respeita o isolamento por empresa via RLS do PostgreSQL (`PrismaService.withTenant`). 🟢
- **RN-RS-02 (Consistência Transacional):** Operações de mutação garantem integridade referencial e auditoria de alterações. 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Throttle por IP) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `POST /auth/senha/esqueci {email, empresaAlias?}` (5 / 15 min) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `POST /auth/senha/redefinir {token, novaSenha}` (10 / 15 min) | Must | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/recuperacao-senha` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/recuperacao-senha` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/recuperacao-senha` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "recuperacao-senha"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "recuperacao-senha"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `recuperacao-senha` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/recuperacao-senha/recuperacao-senha.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/recuperacao-senha/recuperacao-senha.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/recuperacao-senha/recuperacao-senha.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/recuperacao-senha/recuperacao-senha.service.spec.ts` | Componente central | 🟢 |


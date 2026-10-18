# grupos-economicos — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `grupos-economicos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Hierarquia Grupo Econômico → Empresa. Gerencia composição de empresas no grupo (mover
empresa de um grupo para outro), usuários do grupo (perfil é da conta, válido em todas as
empresas do grupo) e remoção de acesso de um usuário a uma empresa específica. É o módulo
com a lógica transacional mais delicada do sistema — concorrência entre operações que
recompõem grupos.

## Responsabilidades

- Hierarquia Grupo Econômico → Empresa. 🟢
- Gerencia composição de empresas no grupo (mover
empresa de um grupo para outro), usuários do grupo (perfil é da conta, válido em todas as
empresas do grupo) e remoção de acesso de um usuário a uma empresa específica. 🟢
- É o módulo
com a lógica transacional mais delicada do sistema — concorrência entre operações que
recompõem grupos. 🟢

## Regras de Negócio

- **RN-GE-01 (3.1 Escopo de administração (`exigirAdmin`, `empresasAdministradas`)):** Só `isAdmin` (perfil `sistemaBase`) gerencia grupos. 🟢
- **RN-GE-02 (3.2 Recomposição de grupo (`salvar`) — a operação mais delicada do sistema):** Como "toda empresa tem grupo" (invariante do domínio), incluir uma empresa num grupo é 🟢
- **RN-GE-03 (3.3 Perfil é do usuário, não do vínculo (`salvarUsuario`)):** Todos os vínculos informados (`input.vinculos`) devem ter o **mesmo** `perfilId` — 🟢
- **RN-GE-04 (3.4 Remoção de acesso (`removerAcesso`)):** Usuário não pode remover o próprio acesso por esta tela (proteção contra lockout 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `contexto(user)` (lista grupos visíveis + empresas "disponíveis" (de outros grupos, candidatas a mover)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `usuarios(id, user)` (lista contas do grupo com seus vínculos por empresa) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `salvarUsuario(id, input, user)` (cria usuário novo no grupo ou dá acesso a um existente, com mesmo perfil em todas as empresas do vínculo) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `removerAcesso(id, usuarioId, empresaId, user)` (desativa o vínculo `UsuarioEmpresa` (não apaga a conta)) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/grupos-economicos` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/grupos-economicos` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/grupos-economicos` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "grupos-economicos"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "grupos-economicos"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `grupos-economicos` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/grupos-economicos/grupos-economicos.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/grupos-economicos/grupos-economicos.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/grupos-economicos/grupos-economicos.service.ts` | Componente central | 🟢 |


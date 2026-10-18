# inicio — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `inicio`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Porta de entrada do sistema: provê o conteúdo exibido na tela inicial (`/`) para qualquer usuário autenticado sem exigir permissão de rotina RBAC para as leituras (mural de comunicados vigentes, aniversariantes da equipe nos próximos 30 dias e status de sincronização com o ERP). Também engloba o CRUD administrativo de comunicados corporativos internos da empresa (`/comunicados`), com segmentação por perfil e controle temporal de vigência.

## Responsabilidades

- Porta de entrada do sistema: provê o conteúdo exibido na tela inicial (`/`) para qualquer usuário autenticado sem exigir permissão de rotina RBAC para as leituras (mural de comunicados vigentes, aniversariantes da equipe nos próximos 30 dias e status de sincronização com o ERP). 🟢
- Também engloba o CRUD administrativo de comunicados corporativos internos da empresa (`/comunicados`), com segmentação por perfil e controle temporal de vigência. 🟢

## Regras de Negócio

- **RN-INIC-01 (3.1 Mural sem barreira de permissão e sem vazamento entre perfis):** As rotas sob `/inicio/*` usam `JwtAuthGuard` e `PermissionsGuard`, porém os métodos de leitura não têm o decorador `@RequirePermission`: qualquer usuário com login válido tem acesso aos dados da sua empresa ativa. O comentário do código explica o motivo: exigir permissão deixaria a tela de boas-vindas vazia para perfis operacionais básicos. 🟢
- **RN-INIC-02 (3.2 Aniversariantes com isolamento UTC e virada de ano):** A data de nascimento é armazenada no banco como timestamp. O cálculo de dia e mês usa estritamente `getUTCDate()` e `getUTCMonth() + 1`, neutralizando deslocamentos de fuso horário local que fariam aniversários à meia-noite retrocederem para a véspera. 🟢
- **RN-INIC-03 (3.3 Cascata de fallbacks para status da integração ERP):** O endpoint `/inicio/status-integracao` resolve a saúde da sincronização em três camadas: 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `GET /inicio/mural` (Nenhuma (só login)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `GET /inicio/aniversariantes` (Nenhuma (só login)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `GET /inicio/status-integracao` (Nenhuma (só login)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `GET /comunicados` (`comunicados.visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `GET /comunicados/:id` (`comunicados.visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `POST /comunicados` (`comunicados.cadastrar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `PATCH /comunicados/:id` (`comunicados.editar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `DELETE /comunicados/:id` (`comunicados.excluir`) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/inicio` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/inicio` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/inicio` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "inicio"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "inicio"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `inicio` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/inicio/inicio.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/inicio/inicio.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/inicio/comunicados.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/inicio/aniversariantes.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/inicio/status-integracao.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/inicio/dto/comunicado.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/inicio/web: app/(app)/page.tsx` | Componente central | 🟢 |
| `apps/api/src/modules/inicio/web: app/(app)/admin/comunicados/page.tsx` | Componente central | 🟢 |


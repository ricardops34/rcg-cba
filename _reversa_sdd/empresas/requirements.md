# empresas — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `empresas`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Cadastro de empresas (tenants). Cada empresa pertence a um `GrupoEconomico`. Controla
quem pode criar/editar empresa dentro do próprio grupo vs. a administração global da
plataforma, campos exclusivos da plataforma (situação de assinatura, teto de usuários),
upload de logo/banner/logo-DANFE, e exclusão (soft delete).

## Responsabilidades

- Cadastro de empresas (tenants). 🟢
- Cada empresa pertence a um `GrupoEconomico`. 🟢
- Controla
quem pode criar/editar empresa dentro do próprio grupo vs. 🟢
- a administração global da
plataforma, campos exclusivos da plataforma (situação de assinatura, teto de usuários),
upload de logo/banner/logo-DANFE, e exclusão (soft delete). 🟢

## Regras de Negócio

- **RN-EMPR-01 (3.1 Escopo de acesso a empresas (`garantirEscopo`)):** Administrador da plataforma (`administradorPlataforma`): acesso irrestrito a qualquer 🟢
- **RN-EMPR-02 (3.2 Campos exclusivos da plataforma (`CAMPOS_DA_PLATAFORMA`)):** `ePlataforma`, `situacao`, `testeExpiraEm`, `limiteUsuarios` são removidos do payload de 🟢
- **RN-EMPR-03 (3.3 Criação de empresa dentro de um grupo (`createDoAtor`)):** Só admin (de empresa ou plataforma) pode criar; admin de empresa precisa já pertencer 🟢
- **RN-EMPR-04 (3.4 Unicidade de alias (`ensureAliasDisponivel`)):** Alias é a URL de login (`?empresa=<alias>`) e precisa ser único **na base inteira** 🟢
- **RN-EMPR-05 (3.5 Upload de logo/banner/logo-DANFE):** Os três seguem o mesmo padrão: grava o novo caminho, e se havia um arquivo anterior, 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `findAll(query, user?)` (admin da plataforma vê todas; demais só as empresas do próprio grupo econômico (ou as vinculadas, se não for admin)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `findOneDoAtor(id, user)` (valida escopo antes de devolver o detalhe (rota pública ao usuário logado)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `create / createDoAtor` (`create` é uso interno (sem validação de ator); `createDoAtor` é o caminho da API — exige `isAdmin` ou `administradorPlataforma`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `update` (remove campos exclusivos da plataforma do payload se o ator não for admin de plataforma) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `setLogo / setLogoDanfe / setBanner` (grava caminho do upload, remove arquivo anterior do disco (best-effort)) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `remove` (soft delete + `situacao: 'cancelada'`) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/empresas` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/empresas` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/empresas` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "empresas"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "empresas"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `empresas` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/empresas/empresas.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/empresas/empresas.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/empresas/empresas.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/empresas/dto/empresa.dto.ts` | Componente central | 🟢 |


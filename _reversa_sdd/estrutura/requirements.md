# estrutura — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `estrutura`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Catálogo global do menu lateral (Módulo → Menu/Submenu → Rotina) e o liga/desliga desse
catálogo por empresa e por plano de assinatura. Dois públicos bem distintos: administrador
da **plataforma** mantém o catálogo (cria módulo, menu, rotina — `PlatformAdminGuard`);
administrador da **empresa** decide o que a empresa usa dentro do que o plano permite
(`EmpresaModulo`/`EmpresaMenu`/`EmpresaRotina`).

## Responsabilidades

- Catálogo global do menu lateral (Módulo → Menu/Submenu → Rotina) e o liga/desliga desse
catálogo por empresa e por plano de assinatura. 🟢
- Dois públicos bem distintos: administrador
da **plataforma** mantém o catálogo (cria módulo, menu, rotina — `PlatformAdminGuard`);
administrador da **empresa** decide o que a empresa usa dentro do que o plano permite
(`EmpresaModulo`/`EmpresaMenu`/`EmpresaRotina`). 🟢

## Regras de Negócio

- **RN-ESTR-01 (3.1 "Ausência de linha = ligado" (dupla camada: exceção manual + allowlist do plano)):** `desativadosDaEmpresa` combina duas fontes independentes num só conjunto de ids 🟢
- **RN-ESTR-02 (3.2 `listModulos` filtra em cascata; `listArvore` só marca):** `listModulos` remove do retorno módulo/menu/submenu/rotina desativados (filtro recursivo 🟢
- **RN-ESTR-03 (3.3 Hierarquia de menu — máximo 2 níveis (`validarMenuPai`)):** Regras, na ordem: não pode ser pai de si mesmo; o pai precisa existir; o pai precisa estar 🟢
- **RN-ESTR-04 (3.4 Exclusão de menu bloqueada por submenu (`removeMenu`)):** Menu com submenus ativos não pode ser excluído (`BadRequestException`) — força "exclua ou 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `listModulos` (Árvore do menu para montar a navegação — só o que está ativo (catálogo + empresa + plano)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `listArvore` (Mesma árvore, mas **com** o que está inativo, marcado em `ativoNaEmpresa` — para a tela de administração religar) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `desativadosDaEmpresa` (Calcula os sets de módulos/menus/rotinas desativados, combinando `Empresa*` (exceção manual) com o plano da assinatura (allowlist)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `definirModuloDaEmpresa/definirMenuDaEmpresa/definirRotinaDaEmpresa` (Upsert do liga/desliga por empresa) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `createModulo/updateModulo/removeModulo, idem Menu/Rotina` (CRUD do catálogo global (sem `empresaId` — não passa por `withTenant`)) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `validarMenuPai` (Regras de hierarquia de menu (máx. 2 níveis, não auto-referência, mesmo módulo)) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/estrutura` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/estrutura` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/estrutura` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "estrutura"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "estrutura"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `estrutura` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/estrutura/estrutura.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/estrutura/estrutura.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/estrutura/estrutura.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/estrutura/dto/estrutura.dto.ts` | Componente central | 🟢 |


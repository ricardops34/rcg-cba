# plataforma — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `plataforma`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

A **administração do SaaS**: quem tem acesso, por quanto tempo e com quantos usuários.
Lista as empresas com uso e último acesso; cria empresa **com o primeiro administrador
na mesma transação**; altera situação, prazo de teste e limite de usuários; vincula e
desvincula administradores de empresa; promove e revoga **administradores da
plataforma**; consulta CNPJ; e mantém um **log próprio** (`plataforma_auditoria`).

**Sem `PermissionsGuard`, de propósito:** os perfis são globais e compartilhados, e dar
uma permissão ao Administrador daria a todo administrador de tenant. O corte é o
`PlatformAdminGuard` (perfil com `administraPlataforma`, que só seed e migration
concedem).

## Responsabilidades

- A **administração do SaaS**: quem tem acesso, por quanto tempo e com quantos usuários. 🟢
- Lista as empresas com uso e último acesso; cria empresa **com o primeiro administrador
na mesma transação**; altera situação, prazo de teste e limite de usuários; vincula e
desvincula administradores de empresa; promove e revoga **administradores da
plataforma**; consulta CNPJ; e mantém um **log próprio** (`plataforma_auditoria`). 🟢
- **Sem `PermissionsGuard`, de propósito:** os perfis são globais e compartilhados, e dar
uma permissão ao Administrador daria a todo administrador de tenant. 🟢
- O corte é o
`PlatformAdminGuard` (perfil com `administraPlataforma`, que só seed e migration
concedem). 🟢

## Regras de Negócio

- **RN-PLAT-01 (3.1 Listagem com uso — RLS e N+1 consciente):** `empresa.findMany` + `count` em paralelo. Uso (vínculos ativos e último login) **por 🟢
- **RN-PLAT-02 (3.2 `criarEmpresa` — empresa e primeiro administrador):** 1. `validarDocumentoEmpresa` (CPF/CNPJ conforme `tipoPessoa`); CNPJ em uso → 409. 🟢
- **RN-PLAT-03 (3.3 Administradores da empresa):** **Listar**: vínculos ativos com perfil Administrador Empresa (`withTenant`); a 🟢
- **RN-PLAT-04 (3.4 Administradores da plataforma):** O perfil é da conta (migration `20260930230000_dados_do_usuario`). `definirAdmin`: 🟢
- **RN-PLAT-05 (3.5 Alterar situação — um registro de log por campo):** Atualiza só os campos enviados (Zod exige ao menos um). Grava `empresa.situacao_alterada` 🟢
- **RN-PLAT-06 (3.6 Achados):** ✅ **Corrigido em 202e7ff** (garantirVagaDeEmpresa e contrato do grupo). Achado original: 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Comportamento) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `GET /consulta-cnpj/:cnpj` (delega a `EnriquecimentoService.consultarCnpj` (módulo `clientes`)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `GET /empresas` (paginada; filtros `situacao`, `apenasExpiradas`, `search` (razão, fantasia, CNPJ)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `POST /empresas` (empresa + administrador (conta nova ou existente)) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `PATCH /empresas/:id/situacao` (situação, `testeExpiraEm`, `limiteUsuarios`, com `motivo` no log) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `GET /contas?email=` (existe conta com o e-mail? (a tela decide se pede nome e senha)) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `GET /empresas/:id/administradores` (contas com perfil Administrador Empresa vinculadas, e em quantas empresas cada uma está) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `POST /empresas/:id/administradores` (vincula conta existente como administradora) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-09 | Execução de `DELETE /empresas/:id/administradores/:usuarioId` (desativa o vínculo; recusa o último administrador) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-10 | Execução de `GET /admins, POST /admins {email}, PATCH /admins/:usuarioId` (lista, promove por e-mail, promove ou revoga) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-11 | Execução de `GET /auditoria` (log, filtrado por empresa e ação, mais recente primeiro) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/plataforma` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/plataforma` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/plataforma` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "plataforma"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "plataforma"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `plataforma` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/plataforma/plataforma.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/plataforma/plataforma.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/plataforma/plataforma.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/plataforma/dto/plataforma.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/plataforma/plataforma-empresa-create.spec.ts` | Componente central | 🟢 |
| `apps/api/src/modules/plataforma/plataforma-uso.spec.ts` | Componente central | 🟢 |


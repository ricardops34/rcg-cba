# planos — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `planos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Catálogo dos **pacotes SaaS** (Básico, Profissional…): preço por ciclo, limite de
usuários, limite de empresas por grupo e a **allowlist de módulos, menus e rotinas** que
o plano libera. A aplicação dessa allowlist acontece em `estrutura`
(`desativadosDaEmpresa`): plano com lista vazia não restringe nada.

## Responsabilidades

- Catálogo dos **pacotes SaaS** (Básico, Profissional…): preço por ciclo, limite de
usuários, limite de empresas por grupo e a **allowlist de módulos, menus e rotinas** que
o plano libera. 🟢
- A aplicação dessa allowlist acontece em `estrutura`
(`desativadosDaEmpresa`): plano com lista vazia não restringe nada. 🟢

## Regras de Negócio

- **RN-PLAN-01 (Isolamento Multi-tenant):** Todo acesso aos dados respeita o isolamento por empresa via RLS do PostgreSQL (`PrismaService.withTenant`). 🟢
- **RN-PLAN-02 (Consistência Transacional):** Operações de mutação garantem integridade referencial e auditoria de alterações. 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Comportamento) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `GET /` (planos não excluídos por `valorMensal`, com ids liberados e `totalEmpresas` (assinaturas de grupos ativos)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `GET /:id` (detalhe com ids liberados) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `POST /` (cria; código único entre os não excluídos) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `PATCH /:id` (altera; listas de ids enviadas **substituem** as atuais) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `DELETE /:id` (soft delete (`ativo=false`); recusa se há assinaturas) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/planos` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/planos` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/planos` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "planos"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "planos"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `planos` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/planos/planos.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/planos/planos.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/planos/planos.service.ts` | Componente central | 🟢 |


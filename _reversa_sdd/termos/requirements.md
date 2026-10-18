# termos — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `termos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Dois assuntos com o mesmo nome, que **não se tocam**:

- **Termos da plataforma (obrigatórios, com aceite):** documentos globais versionados (`termo_documentos`) e o aceite por usuário (`termo_aceites`), com evidência (data do servidor, IP, navegador, hash do conteúdo, declaração, empresa de contexto). Enquanto houver documento obrigatório, vigente e não aceito, o `JwtAuthGuard` responde 403 `TERMO_PENDENTE` em toda rota autenticada, exceto as marcadas `@PermitirTermoPendente`.
- **Termos da empresa (informativos, sem aceite):** texto livre em Markdown/HTML na coluna `empresas.termosUso`, mostrado na consulta "Termos de Uso e Normas". Se vazio, a tela mostra uma sugestão gerada no navegador (`gerarSugestaoTermosEmpresa`, com nome e CNPJ). Não gera pendência, não tem versão, não tem aceite.

## Responsabilidades

- Dois assuntos com o mesmo nome, que **não se tocam**:

- **Termos da plataforma (obrigatórios, com aceite):** documentos globais versionados (`termo_documentos`) e o aceite por usuário (`termo_aceites`), com evidência (data do servidor, IP, navegador, hash do conteúdo, declaração, empresa de contexto). 🟢
- Enquanto houver documento obrigatório, vigente e não aceito, o `JwtAuthGuard` responde 403 `TERMO_PENDENTE` em toda rota autenticada, exceto as marcadas `@PermitirTermoPendente`. 🟢
- - **Termos da empresa (informativos, sem aceite):** texto livre em Markdown/HTML na coluna `empresas.termosUso`, mostrado na consulta "Termos de Uso e Normas". 🟢
- Se vazio, a tela mostra uma sugestão gerada no navegador (`gerarSugestaoTermosEmpresa`, com nome e CNPJ). 🟢
- Não gera pendência, não tem versão, não tem aceite. 🟢

## Regras de Negócio

- **RN-TERM-01 (Isolamento Multi-tenant):** Todo acesso aos dados respeita o isolamento por empresa via RLS do PostgreSQL (`PrismaService.withTenant`). 🟢
- **RN-TERM-02 (Consistência Transacional):** Operações de mutação garantem integridade referencial e auditoria de alterações. 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Comportamento) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `GET /termos/status` (pendentes (com o conteúdo) e histórico de aceites do usuário; reabastece o cache de pendência) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `POST /termos/:id/aceite` (confere vigência e hash, grava o aceite com `upsert` (idempotente) e descarta o cache do usuário) | Must | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/termos` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/termos` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/termos` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "termos"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "termos"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `termos` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/termos/termos.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/termos/termos.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/termos/termos.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/termos/termo-pendente.exception.ts` | Componente central | 🟢 |
| `apps/api/src/modules/termos/dto/termo.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/termos/../../common/decorators/permitir-termo-pendente.decorator.ts` | Componente central | 🟢 |
| `apps/api/src/modules/termos/web: lib/termos-formatacao.ts` | Componente central | 🟢 |
| `apps/api/src/modules/termos/web: components/termos/*` | Componente central | 🟢 |
| `apps/api/src/modules/termos/web: components/crud/empresa-termos-editor.tsx` | Componente central | 🟢 |


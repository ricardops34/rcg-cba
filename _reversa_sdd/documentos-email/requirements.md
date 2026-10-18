# documentos-email — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `documentos-email`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Envio por e-mail ao **e-mail do cadastro do cliente**: 2ª via do DANFE (com XML
opcional), 2ª via do boleto e cobrança dos títulos vencidos. Usa a identidade visual da
empresa e a assinatura do colaborador, e registra no histórico de atendimento
(`registrarAtividadeDocumento`).

## Responsabilidades

- Envio por e-mail ao **e-mail do cadastro do cliente**: 2ª via do DANFE (com XML
opcional), 2ª via do boleto e cobrança dos títulos vencidos. 🟢
- Usa a identidade visual da
empresa e a assinatura do colaborador, e registra no histórico de atendimento
(`registrarAtividadeDocumento`). 🟢

## Regras de Negócio

- **RN-DE-01 (Isolamento Multi-tenant):** Todo acesso aos dados respeita o isolamento por empresa via RLS do PostgreSQL (`PrismaService.withTenant`). 🟢
- **RN-DE-02 (Consistência Transacional):** Operações de mutação garantem integridade referencial e auditoria de alterações. 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Permissão (qualquer uma)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `POST /documentos-email/nota/:id` (`notas-saida.visualizar` ou `posicao-cliente.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `POST /documentos-email/titulo/:id` (`titulos-receber.visualizar` ou `posicao-cliente.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `POST /documentos-email/cobranca/:clienteId` (`titulos-receber.visualizar` ou `posicao-cliente.visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/documentos-email` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/documentos-email` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/documentos-email` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "documentos-email"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "documentos-email"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `documentos-email` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/documentos-email/documentos-email.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/documentos-email/documentos-email.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/documentos-email/documentos-email.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/documentos-email/documentos-email.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/documentos-email/documentos-email.service.spec.ts` | Componente central | 🟢 |


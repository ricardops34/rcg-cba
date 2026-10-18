# assinaturas — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `assinaturas`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

O **contrato SaaS** da plataforma: **uma assinatura por grupo econômico** (plano, ciclo,
valor cobrado, dia de vencimento, situação). Alterar a assinatura **propaga para todas as
empresas ativas do grupo** a situação de acesso e o limite de usuários do plano. Também dá
o resumo comercial (MRR, ativas, em teste, inadimplentes). Só administração da
plataforma.

## Responsabilidades

- O **contrato SaaS** da plataforma: **uma assinatura por grupo econômico** (plano, ciclo,
valor cobrado, dia de vencimento, situação). 🟢
- Alterar a assinatura **propaga para todas as
empresas ativas do grupo** a situação de acesso e o limite de usuários do plano. 🟢
- Também dá
o resumo comercial (MRR, ativas, em teste, inadimplentes). 🟢
- Só administração da
plataforma. 🟢

## Regras de Negócio

- **RN-ASSI-01 (3.1 `updateAssinaturaGrupo`):** Numa transação: 🟢
- **RN-ASSI-02 (3.2 Resumo SaaS — MRR):** `MRR = Σ (valorMensalidade / meses do ciclo)` das assinaturas `ativa` de grupos não 🟢
- **RN-ASSI-03 (3.3 Achados):** 🟡 **`valorMensalidade` é o valor do ciclo, não da mensalidade.** O nome engana, e o 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Rota` (Comportamento) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `GET /grupos/:grupoId/assinatura` (contrato do grupo, ou `null` (não cria assinatura gratuita)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `PATCH /grupos/:grupoId/assinatura` (cria ou altera e propaga às empresas) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `GET /empresas/:empresaId/assinatura` (resolve o grupo da empresa e devolve o contrato dele) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `PATCH /empresas/:empresaId/assinatura` (idem, alterando) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `GET /assinaturas` (assinaturas de grupos não excluídos, com plano e número de empresas ativas) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `GET /assinaturas/resumo` (MRR, total de empresas, ativas, em teste, inadimplentes) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/assinaturas` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/assinaturas` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/assinaturas` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "assinaturas"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "assinaturas"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `assinaturas` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/assinaturas/assinaturas.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/assinaturas/assinaturas.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/assinaturas/assinaturas.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/assinaturas/assinaturas-grupo.spec.ts` | Componente central | 🟢 |


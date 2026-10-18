# estoque — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `estoque`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Consulta **só-leitura** de saldo de estoque — "nada de create/update/delete manual"
(comentário explícito no código): o saldo entra só pelo import do legado (e no futuro por
API externa de manutenção). Listagem agregada por produto (soma em todos os armazéns de
revenda, ou só no armazém filtrado) e detalhe por produto aberto por armazém.

## Responsabilidades

- Consulta **só-leitura** de saldo de estoque — "nada de create/update/delete manual"
(comentário explícito no código): o saldo entra só pelo import do legado (e no futuro por
API externa de manutenção). 🟢
- Listagem agregada por produto (soma em todos os armazéns de
revenda, ou só no armazém filtrado) e detalhe por produto aberto por armazém. 🟢

## Regras de Negócio

- **RN-ESTO-01 (3.1 Regra de "armazém de revenda" como filtro universal):** `estoqueFilter`/`AND: [{ armazem: { revenda: true } }]` é aplicado em toda leitura de 🟢
- **RN-ESTO-02 (3.2 Visibilidade de armazém/produto inativo condicionada a saldo):** Duplo filtro "inativo só aparece com saldo": 🟢
- **RN-ESTO-03 (3.3 `comSaldo` — três modos de filtro sobre a mesma relação `estoques`):** `comSaldo === false`: produto cuja **toda** linha que conta (dentro de `estoqueFilter`) 🟢
- **RN-ESTO-04 (3.4 Ordenação por saldo agregado — paginação em SQL cru):** `sortBy === 'saldoTotal'` não é ordenável pelo Prisma (`ORDER BY` por soma agregada antes 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `findAll` (Listagem agregada por produto, com filtro de armazém/categoria/busca/`comSaldo`, ordenação incluindo por saldo agregado) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `findByProduto` (Detalhe de um produto aberto por armazém (não some do total)) | Must | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/estoque` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/estoque` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/estoque` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "estoque"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "estoque"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `estoque` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/estoque/estoque.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/estoque/estoque.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/estoque/estoque.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/estoque/dto/estoque.dto.ts` | Componente central | 🟢 |


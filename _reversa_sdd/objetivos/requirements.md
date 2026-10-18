# objetivos — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `objetivos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Duas coisas no mesmo módulo:

1. **Cadastro de metas** — objetivo mensal por vendedor (valor em R$, nº de clientes,
   novos clientes) com linhas de meta por categoria; CRUD e cópia de período com reajuste.
2. **Dashboards** — Comercial (meta × realizado do escopo, por categoria, filtro de
   município) e Gerencial (o mesmo mês por vendedor, agrupado por hierarquia, com
   indicadores de topo e detalhe por categoria). O realizado é apurado **ao vivo** de
   `notas_saida_itens` pelo corte comum `corteDeVenda`.

Os objetivos também chegam do ERP pela integração (`integracao/objetivos`, chave
`X2_UNICO`), que fica fora deste módulo.

## Responsabilidades

- Duas coisas no mesmo módulo:

1. 🟢
- **Cadastro de metas** — objetivo mensal por vendedor (valor em R$, nº de clientes,
   novos clientes) com linhas de meta por categoria; CRUD e cópia de período com reajuste. 🟢
- **Dashboards** — Comercial (meta × realizado do escopo, por categoria, filtro de
   município) e Gerencial (o mesmo mês por vendedor, agrupado por hierarquia, com
   indicadores de topo e detalhe por categoria). 🟢
- O realizado é apurado **ao vivo** de
   `notas_saida_itens` pelo corte comum `corteDeVenda`. 🟢
- Os objetivos também chegam do ERP pela integração (`integracao/objetivos`, chave
`X2_UNICO`), que fica fora deste módulo. 🟢

## Regras de Negócio

- **RN-OBJE-01 (3.1 O que é "venda" — `corteDeVenda`):** Regra única para Dashboards, Objetivos e Consultas (`common/vendas/venda-analitica.ts`). 🟢
- **RN-OBJE-02 (3.2 Dashboard Comercial):** Meta: soma dos objetivos **ativos** do mês no filtro de vendedor; `numeroCliente` 🟢
- **RN-OBJE-03 (3.3 Dashboard Gerencial):** Seis leituras em paralelo: objetivos do mês, realizado por vendedor, pares 🟢
- **RN-OBJE-04 (3.4 Detalhe do vendedor):** O vendedor fora do escopo ou inexistente responde 404. A meta e o realizado saem por 🟢
- **RN-OBJE-05 (3.5 Clientes sem vendedor):** Até 1000 clientes (`LIMITE_CLIENTES_SEM_VENDEDOR`) em ordem alfabética, com o `total` 🟢
- **RN-OBJE-06 (3.6 Cópia de período):** `fator = 1 + percReajuste/100` (de −100 a 1000); `ajustar(v) = round(v×fator×100)/100` 🟢
- **RN-OBJE-07 (3.7 Achados):** 🔴 **A unicidade ignora o soft delete.** O schema tem 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `dashboard — GET /objetivos/dashboard` (`dashboard-comercial.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `municipiosDashboard — GET /objetivos/dashboard/municipios` (`dashboard-comercial.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `dashboardGerencial — GET /objetivos/dashboard-gerencial` (`dashboard-gerencial.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `clientesSemVendedor — GET …/dashboard-gerencial/clientes-sem-vendedor` (`dashboard-gerencial.visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `dashboardGerencialVendedor — GET …/dashboard-gerencial/vendedor/:vendedorId` (`dashboard-gerencial.visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `findAll — GET /objetivos` (`objetivos.visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `findOne — GET /objetivos/:id` (`objetivos.visualizar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `create — POST /objetivos` (`objetivos.cadastrar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-09 | Execução de `copiarPeriodo — POST /objetivos/copiar-periodo` (`objetivos.cadastrar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-10 | Execução de `update — PATCH /objetivos/:id` (`objetivos.editar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-11 | Execução de `remove — DELETE /objetivos/:id` (`objetivos.excluir`) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/objetivos` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/objetivos` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/objetivos` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "objetivos"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "objetivos"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `objetivos` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/objetivos/objetivos.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/objetivos/objetivos.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/objetivos/objetivos.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/objetivos/dto/objetivo.dto.ts` | Componente central | 🟢 |


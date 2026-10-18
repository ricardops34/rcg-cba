# relatorios — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `relatorios`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Relatórios operacionais em linhas de item, para os perfis **Gerente**, **Administrativo**
e administradores, sempre da empresa ativa inteira:

- **Compras**: itens de nota de entrada de mercadoria;
- **Vendas**: itens de venda;
- **Vendas por vendedor (mensal)**: matriz cliente × mês;
- **Estoque e compra**: estoque, entradas, saídas, média e sugestão de compra por produto;
- **Opções** dos filtros (produtos, fornecedores, clientes).

A exportação PDF/Excel é feita no navegador. A página grande é tratada como exportação
e exige `exportar` (§3.1).

## Responsabilidades

- Relatórios operacionais em linhas de item, para os perfis **Gerente**, **Administrativo**
e administradores, sempre da empresa ativa inteira:

- **Compras**: itens de nota de entrada de mercadoria;
- **Vendas**: itens de venda;
- **Vendas por vendedor (mensal)**: matriz cliente × mês;
- **Estoque e compra**: estoque, entradas, saídas, média e sugestão de compra por produto;
- **Opções** dos filtros (produtos, fornecedores, clientes). 🟢
- A exportação PDF/Excel é feita no navegador. 🟢
- A página grande é tratada como exportação
e exige `exportar` (§3.1). 🟢

## Regras de Negócio

- **RN-RELA-01 (3.1 Exportar = página grande):** `exigirExportarSeGrande`: com `pageSize` acima de 200 (`MAXIMO_DA_TELA`), exige 🟢
- **RN-RELA-02 (3.2 Período civil):** `periodo(inicio, fim)`: `[inicio 00:00Z, fim + 1 dia)`. Fim antes do início dá 400. 🟢
- **RN-RELA-03 (3.3 O que é compra (decisões do usuário, 13–14/10/2026)):** Nota de entrada `tipo='N'`, espécie em `SPED`, `NFE`, `NF`, `NFA` (fora CT-e, serviço, 🟢
- **RN-RELA-04 (3.4 Categoria "usada", mais estrita que o Dashboard):** Os relatórios só trazem produto de categoria com `usado = true`; a categoria **em 🟢
- **RN-RELA-05 (3.5 Vendas):** `corteDeVenda.item` + emissão no período + categoria usada; filtros de vendedor (pelo 🟢
- **RN-RELA-06 (3.6 Vendas por vendedor (mensal)):** SQL bruto agrupando (vendedor do cabeçalho, cliente, `to_char(dtEmissao,'YYYY-MM')`), 🟢
- **RN-RELA-07 (3.7 Estoque e compra):** **Estoque** = soma do saldo dos armazéns com `revenda = true`. 🟢
- **RN-RELA-08 (3.8 Opções):** A busca por termos (`condicaoBuscaTermosSql`) cobre código, nome, fantasia e CNPJ/CPF 🟢
- **RN-RELA-09 (3.9 Achados):** 🟡 **Sem escopo hierárquico.** Nenhuma rota chama `resolverEscopoVendedores`: quem tem 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `compras — GET /relatorios/compras` (`relatorio-compras.visualizar` (+ `exportar` se `pageSize` > 200)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `vendas — GET /relatorios/vendas` (`relatorio-vendas.visualizar` (+ `exportar` se `pageSize` > 200)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `vendasPorVendedor — GET /relatorios/vendas-por-vendedor` (`relatorio-vendas.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `estoqueCompra — GET /relatorios/estoque-compra` (`relatorio-estoque-compra.visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `opcoes — GET /relatorios/opcoes/:tipo` (qualquer um dos três `visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/relatorios` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/relatorios` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/relatorios` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "relatorios"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "relatorios"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `relatorios` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/relatorios/relatorios.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/relatorios/relatorios.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/relatorios/relatorios.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/relatorios/relatorios.service.spec.ts` | Componente central | 🟢 |


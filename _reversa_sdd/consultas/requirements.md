# consultas — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `consultas`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Consultas gerenciais de venda em formato **pivô mensal** (uma linha por entidade, uma
coluna por mês, no máximo 12 meses): por cliente, vendedor, produto, árvore
categoria → subcategoria → produto, e evolução por vendedor em quatro indicadores. Usa
SQL bruto (`$queryRaw`), porque o query builder não pivota e a coluna do vendedor muda
conforme o parâmetro da empresa. Exportação PDF/Excel é montada no navegador; a
permissão `exportar` só controla os botões. O service é exportado e reusado pelo agente
(`vendasPorCliente`, `vendasPorProduto`).

## Responsabilidades

- Consultas gerenciais de venda em formato **pivô mensal** (uma linha por entidade, uma
coluna por mês, no máximo 12 meses): por cliente, vendedor, produto, árvore
categoria → subcategoria → produto, e evolução por vendedor em quatro indicadores. 🟢
- Usa
SQL bruto (`$queryRaw`), porque o query builder não pivota e a coluna do vendedor muda
conforme o parâmetro da empresa. 🟢
- Exportação PDF/Excel é montada no navegador; a
permissão `exportar` só controla os botões. 🟢
- O service é exportado e reusado pelo agente
(`vendasPorCliente`, `vendasPorProduto`). 🟢

## Regras de Negócio

- **RN-CONS-01 (3.1 Base do vendedor):** `baseVendedor`: a escolha da consulta (`?baseVendedor=`) ganha; senão vale o parâmetro 🟢
- **RN-CONS-02 (3.2 Dupla trava de visibilidade):** 1. `condicaoEscopoClientes`: com escopo restrito, só clientes cujo `c.vendedorId` está 🟢
- **RN-CONS-03 (3.3 O que é venda e o valor):** `corteDeVenda` (ver `objetivos` §3.1), nas formas `notaSql` e `itemSql`. O valor é 🟢
- **RN-CONS-04 (3.4 Período e pivô):** Período: `(ano×12 + mes) BETWEEN emMeses(inicial) AND emMeses(final)`, com no máximo 🟢
- **RN-CONS-05 (3.5 Árvore de categorias):** Uma passada: cada linha (produto, ano, mês) soma no produto, na subcategoria, na 🟢
- **RN-CONS-06 (3.6 Evolução):** | Indicador | Medida | Origem | Base | 🟢
- **RN-CONS-07 (3.7 Achados):** 🟡 **Devolução fora das Consultas** (🟡 INFERIDO quanto ao impacto). As Consultas somam 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `vendasPorCliente — GET /consultas/vendas-cliente` (`consulta-vendas-cliente.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `vendasPorVendedor — GET /consultas/vendas-vendedor` (`consulta-vendas-vendedor.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `vendasPorProduto — GET /consultas/vendas-produto` (`consulta-vendas-produto.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `vendasPorCategoria — GET /consultas/vendas-categoria` (`consulta-vendas-categoria.visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `evolucao — GET /consultas/evolucao` (`consulta-evolucao.visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/consultas` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/consultas` | 🟢 |
| Configuração | Constante `Parâmetro CONSULTA_VENDAS_BASE_VENDEDOR` com valor `nota (padrão) \` (`cliente`) | `apps/api/src/modules/consultas` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "consultas"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "consultas"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `consultas` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/consultas/consultas.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/consultas/consultas.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/consultas/consultas.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/consultas/dto/consulta.dto.ts` | Componente central | 🟢 |


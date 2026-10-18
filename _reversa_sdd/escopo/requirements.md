# escopo — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `escopo`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

`GET /escopo/vendedores` (só `JwtAuthGuard`, **sem permissão de rotina**, de propósito):
os vendedores **dentro do escopo hierárquico** do usuário (`id`, `nome`,
`nomeReduzido`), para os filtros "Vendedor" das telas escopadas (notas, itens,
títulos), sem expor o `VendedoresController`, que não restringe carteira. Devolve
`{data, restrito}`; `restrito = false` significa acesso total.

## Responsabilidades

- `GET /escopo/vendedores` (só `JwtAuthGuard`, **sem permissão de rotina**, de propósito):
os vendedores **dentro do escopo hierárquico** do usuário (`id`, `nome`,
`nomeReduzido`), para os filtros "Vendedor" das telas escopadas (notas, itens,
títulos), sem expor o `VendedoresController`, que não restringe carteira. 🟢
- Devolve
`{data, restrito}`; `restrito = false` significa acesso total. 🟢

## Regras de Negócio

- **RN-ESCO-01 (Isolamento Multi-tenant):** Todo acesso aos dados respeita o isolamento por empresa via RLS do PostgreSQL (`PrismaService.withTenant`). 🟢
- **RN-ESCO-02 (Consistência Transacional):** Operações de mutação garantem integridade referencial e auditoria de alterações. 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Operação `EscopoService.vendedores` | Must | Executar conforme regras de negócio do módulo com tratamento de erros |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/escopo` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/escopo` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/escopo` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "escopo"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "escopo"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `escopo` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/escopo/escopo.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/escopo/escopo.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/escopo/escopo.service.ts` | Componente central | 🟢 |


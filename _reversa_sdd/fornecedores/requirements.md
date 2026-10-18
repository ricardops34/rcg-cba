# fornecedores — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `fornecedores`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Cadastro de fornecedor **espelhado do ERP**, só-leitura pela API interna: dados entram e
saem só pela API de integração (`/integracao/fornecedores`). Listagem com busca e filtro,
e detalhe por id.

## Responsabilidades

- Cadastro de fornecedor **espelhado do ERP**, só-leitura pela API interna: dados entram e
saem só pela API de integração (`/integracao/fornecedores`). 🟢
- Listagem com busca e filtro,
e detalhe por id. 🟢

## Regras de Negócio

- **RN-FORN-01 (3.1 Sem escopo hierárquico — diferente de Clientes):** Comentário explícito no topo do service: fornecedor não tem carteira (não há 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `findAll` (Listagem paginada com busca (razão social, nome fantasia, CNPJ/CPF, código ERP) e filtros (`ativo`, `uf`)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `findOne` (Detalhe por id, 404 se não encontrado ou excluído) | Must | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/fornecedores` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/fornecedores` | 🟢 |
| Configuração | Constante `SORT_FIELDS` com valor `razaoSocial/nomeFantasia/codigoErp/municipio/uf/ativo/createdAt` (whitelist de ordenação) | `apps/api/src/modules/fornecedores` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "fornecedores"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "fornecedores"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `fornecedores` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/fornecedores/fornecedores.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/fornecedores/fornecedores.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/fornecedores/fornecedores.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/fornecedores/dto/fornecedor.dto.ts` | Componente central | 🟢 |


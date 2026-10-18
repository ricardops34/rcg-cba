# cadastros — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `cadastros`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Tabelas auxiliares do menu "Cadastros". Dois grupos, com regra de isolamento **diferente**:

- **Por empresa (RLS, `withTenant`):** `categorias`, `condicoes-pagamento`, `armazens`,
  `tabelas-preco`, `regras-desconto`.
- **Globais, compartilhadas entre todas as empresas (sem `empresaId`, sem RLS, `this.prisma` direto):**
  `paises`, `estados`, `municipios`, `ceps`, `cnaes`.

## Responsabilidades

- Tabelas auxiliares do menu "Cadastros". 🟢
- Dois grupos, com regra de isolamento **diferente**:

- **Por empresa (RLS, `withTenant`):** `categorias`, `condicoes-pagamento`, `armazens`,
  `tabelas-preco`, `regras-desconto`. 🟢
- - **Globais, compartilhadas entre todas as empresas (sem `empresaId`, sem RLS, `this.prisma` direto):**
  `paises`, `estados`, `municipios`, `ceps`, `cnaes`. 🟢

## Regras de Negócio

- **RN-CADA-01 (3.1 Listagens):** Padrão único: `where` com `deletedAt: null`, filtros opcionais (`ativo`, e por entidade), 🟢
- **RN-CADA-02 (3.2 Regras de desconto):** `validarFaixas`: sequência única e faixas que não se sobrepõem (ordenadas por `percInicial`, cada 🟢
- **RN-CADA-03 (3.3 Categorias):** Duas marcações da plataforma, que o ERP **não** sobrescreve (a integração só grava descrição, pai, 🟢
- **RN-CADA-04 (3.4 CEP: cache primeiro, ViaCEP no miss):** `consultar`: 8 dígitos (senão 400); procura em `ceps`; no miss chama o ViaCEP (`ExternalHttpService`; 🟢
- **RN-CADA-05 (3.5 CRUDs globais):** `create`/`update` fazem `limpar(input)` (texto vazio vira `null`) e gravam com `createdBy`/`updatedBy`; 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Submódulo` (Leitura) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `armazens, condicoes-pagamento, tabelas-preco (+ :id/itens)` (`visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `categorias` (`visualizar` (aceita também a permissão de 3 relatórios)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `regras-desconto` (`visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `paises, estados, municipios, cnaes, ceps` (`visualizar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `GET /ceps/consulta/:cep` (só login) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/cadastros` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/cadastros` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/cadastros` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "cadastros"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "cadastros"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `cadastros` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/cadastros/cadastros.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/cadastros/categorias/*` | Componente central | 🟢 |
| `apps/api/src/modules/cadastros/condicoes-pagamento/*` | Componente central | 🟢 |
| `apps/api/src/modules/cadastros/armazens/*` | Componente central | 🟢 |
| `apps/api/src/modules/cadastros/tabelas-preco/*` | Componente central | 🟢 |
| `apps/api/src/modules/cadastros/regras-desconto/*` | Componente central | 🟢 |
| `apps/api/src/modules/cadastros/estados/*` | Componente central | 🟢 |
| `apps/api/src/modules/cadastros/municipios/*` | Componente central | 🟢 |
| `apps/api/src/modules/cadastros/paises/*` | Componente central | 🟢 |
| `apps/api/src/modules/cadastros/ceps/*` | Componente central | 🟢 |
| `apps/api/src/modules/cadastros/cnaes/*` | Componente central | 🟢 |


# cliente-campo-config — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `cliente-campo-config`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Módulo pequeno e de propósito único: quais campos do cadastro de Cliente a empresa decide
travar para edição (ex.: "razão social" e "CNPJ/CPF" só o ERP altera). Não é RBAC — é
configuração por empresa, consultada por qualquer usuário autenticado (o próprio
formulário de Cliente a usa para desabilitar campo na tela) e **reforçada no servidor**
pelos serviços de `clientes` que de fato gravam.

## Responsabilidades

- Módulo pequeno e de propósito único: quais campos do cadastro de Cliente a empresa decide
travar para edição (ex.: "razão social" e "CNPJ/CPF" só o ERP altera). 🟢
- Não é RBAC — é
configuração por empresa, consultada por qualquer usuário autenticado (o próprio
formulário de Cliente a usa para desabilitar campo na tela) e **reforçada no servidor**
pelos serviços de `clientes` que de fato gravam. 🟢

## Regras de Negócio

- **RN-CCC-01 (3.1 Lista canônica derivada do schema de Cliente (`CAMPOS_CLIENTE_CONFIGURAVEIS`)):** Em `@plataforma/contracts`, a lista de campos configuráveis é `Object.keys(clienteCreateSchema.shape)` 🟢
- **RN-CCC-02 (3.2 "Sem configuração = editável" (rollout sem quebra)):** `obterConfig` usa `porCampo.get(campo) ?? true` — campo sem linha gravada em 🟢
- **RN-CCC-03 (3.3 Reforço server-side, e não só na tela):** Quem de fato aplica a trava não é este módulo — é cada serviço de `clientes` que grava 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `obterConfig` (Mapa campo → editável para toda a lista canônica de campos configuráveis; campo sem linha = editável (default)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `atualizar` (Upsert por campo (`empresaId_campo`) e devolve a config recalculada) | Must | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/cliente-campo-config` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/cliente-campo-config` | 🟢 |
| Configuração | Constante `CAMPOS_CLIENTE_CONFIGURAVEIS` com valor `chaves de clienteCreateSchema + "cnaes"` (universo de campos que podem ser travados) | `apps/api/src/modules/cliente-campo-config` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "cliente-campo-config"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "cliente-campo-config"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `cliente-campo-config` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/cliente-campo-config/cliente-campo-config.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/cliente-campo-config/cliente-campo-config.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/cliente-campo-config/cliente-campo-config.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/cliente-campo-config/dto/cliente-campo-config.dto.ts` | Componente central | 🟢 |


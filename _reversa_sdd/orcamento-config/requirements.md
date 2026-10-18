# orcamento-config — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `orcamento-config`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Apesar do nome, **não lê nem grava a tabela `orcamento_config`**. É uma fachada de
leitura de um único parâmetro de sistema, `ORCAMENTO_DIAS_VALIDADE` (Administração >
Parâmetros), exposta sem permissão própria porque quem precisa dela — o vendedor, no
formulário de Orçamento — não tem acesso à tela de Parâmetros. A tabela
`orcamento_config` sobrou só com o contador do número do orçamento, usado por
`orcamentos/proximo-numero-orcamento.ts` (ver módulo `orcamentos` §3.6). O nome do módulo
é herança de quando a validade morava nessa tabela 🟡 (inferido do comentário do service
e de `proximo-numero-orcamento.ts`, que ainda cita um `diasValidade` na tabela).

## Responsabilidades

- Apesar do nome, **não lê nem grava a tabela `orcamento_config`**. 🟢
- É uma fachada de
leitura de um único parâmetro de sistema, `ORCAMENTO_DIAS_VALIDADE` (Administração >
Parâmetros), exposta sem permissão própria porque quem precisa dela — o vendedor, no
formulário de Orçamento — não tem acesso à tela de Parâmetros. 🟢
- A tabela
`orcamento_config` sobrou só com o contador do número do orçamento, usado por
`orcamentos/proximo-numero-orcamento.ts` (ver módulo `orcamentos` §3.6). 🟢
- O nome do módulo
é herança de quando a validade morava nessa tabela 🟡 (inferido do comentário do service
e de `proximo-numero-orcamento.ts`, que ainda cita um `diasValidade` na tabela). 🟢

## Regras de Negócio

- **RN-OC-01 (3.1 Valor com padrão em cascata):** `obterNumero` (`parametros.service.ts:258`) devolve o padrão **30** quando o parâmetro 🟢
- **RN-OC-02 (3.2 A validade é só sugestão, aplicada no navegador):** O servidor não usa `diasValidade` para nada. Quem aplica é `orcamento-form.tsx:656-668`: 🟢
- **RN-OC-03 (3.3 `updatedAt` inventado quando não há linha):** Sem linha do parâmetro em `parametros_empresa`, a resposta traz 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `OrcamentoConfigController.getVigente(user) — GET /orcamento-config` (usuário autenticado (empresa ativa)) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `OrcamentoConfigService.getVigente(empresaId)` (empresa) | Must | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/orcamento-config` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/orcamento-config` | 🟢 |
| Configuração | Constante `PARAMETRO_DIAS_VALIDADE` com valor `'ORCAMENTO_DIAS_VALIDADE'` (`orcamento-config.service.ts:5` (exportada, sem outro importador)) | `apps/api/src/modules/orcamento-config` | 🟢 |
| Configuração | Constante `DIAS_VALIDADE_PADRAO` com valor `30` (`orcamento-config.service.ts:6`) | `apps/api/src/modules/orcamento-config` | 🟢 |
| Configuração | Constante `parâmetro ORCAMENTO_DIAS_VALIDADE` com valor `numero, tamanho 3, seed '30'` (`seed-base.ts:111`) | `apps/api/src/modules/orcamento-config` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "orcamento-config"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "orcamento-config"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `orcamento-config` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/orcamento-config/orcamento-config.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/orcamento-config/orcamento-config.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/orcamento-config/orcamento-config.service.ts` | Componente central | 🟢 |


# contas-bancarias — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `contas-bancarias`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

CRUD do **convênio de cobrança** da empresa — o insumo da 2ª via de boleto
(`titulos-receber`). Guarda banco, agência, conta, carteira, beneficiário, textos da
ficha e o logo do banco, e marca **uma** conta padrão por empresa, usada por todo título
que não aponta conta (o caso de todo título importado do legado). Sem escopo de vendedor:
é dado da empresa; o corte por tenant é a RLS.

## Responsabilidades

- CRUD do **convênio de cobrança** da empresa — o insumo da 2ª via de boleto
(`titulos-receber`). 🟢
- Guarda banco, agência, conta, carteira, beneficiário, textos da
ficha e o logo do banco, e marca **uma** conta padrão por empresa, usada por todo título
que não aponta conta (o caso de todo título importado do legado). 🟢
- Sem escopo de vendedor:
é dado da empresa; o corte por tenant é a RLS. 🟢

## Regras de Negócio

- **RN-CB-01 (3.1 Uma conta padrão por empresa, por atualização em massa):** `desmarcarOutrosPadroes` roda **depois** de gravar: marcar a nova como padrão é o jeito de 🟢
- **RN-CB-02 (3.2 Exclusão preserva o vínculo dos títulos):** Soft delete sem tocar `titulos_receber.contaBancariaId`: a 2ª via de um boleto antigo 🟢
- **RN-CB-03 (3.3 Logo do banco em disco local):** Upload `multer` em `BANCOS_DIR` (`uploads/bancos`), nome `uuid` + extensão pelo MIME 🟢
- **RN-CB-04 (3.4 Validação do contrato × gerador do boleto):** O contrato aceita `agencia` até **5** dígitos e `conta` até **9**, mas o gerador Bradesco 🟢
- **RN-CB-05 (3.5 Percentuais de multa e juros: guardados e não usados):** `jurosMesPerc` e `multaPerc` são gravados e listados (`Multa 2% · Juros 1%/mês`), mas 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `findAll — GET /contas-bancarias` (`contas-bancarias.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `findOne — GET /:id` (`visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `create — POST` (`cadastrar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `update — PATCH /:id` (`editar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `setLogo — POST /:id/logo (multipart file)` (`editar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `removeLogo — DELETE /:id/logo` (`editar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `remove — DELETE /:id` (`excluir`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `contaPadrao(empresaId) (exportada)` (—) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/contas-bancarias` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/contas-bancarias` | 🟢 |
| Configuração | Constante `bancoBoletoSchema` com valor `enum(['237'])` (contracts) | `apps/api/src/modules/contas-bancarias` | 🟢 |
| Configuração | Constante `SORT_FIELDS` com valor `descricao, banco, agencia, ativo, createdAt` (service) | `apps/api/src/modules/contas-bancarias` | 🟢 |
| Configuração | Constante `LOGO_MAX_BYTES` com valor `2 MB` (`common/uploads/uploads.config.ts`) | `apps/api/src/modules/contas-bancarias` | 🟢 |
| Configuração | Constante `LOGO_MIME_TYPES` com valor `png, jpeg, webp, svg+xml` (idem) | `apps/api/src/modules/contas-bancarias` | 🟢 |
| Configuração | Constante `Padrões da ficha` com valor `local "Pagável em qualquer banco até o vencimento", aceite N, espécie DM` (contrato e schema) | `apps/api/src/modules/contas-bancarias` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "contas-bancarias"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "contas-bancarias"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `contas-bancarias` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/contas-bancarias/contas-bancarias.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/contas-bancarias/contas-bancarias.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/contas-bancarias/contas-bancarias.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/contas-bancarias/dto/conta-bancaria.dto.ts` | Componente central | 🟢 |


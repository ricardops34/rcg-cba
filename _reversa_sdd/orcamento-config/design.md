# orcamento-config — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `orcamento-config`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `OrcamentoConfigController.getVigente(user) — GET /orcamento-config` | `usuário autenticado (empresa ativa)` | ``{ diasValidade, updatedAt }`` | Baixa |
| `OrcamentoConfigService.getVigente(empresaId)` | `empresa` | ``diasValidade` via `ParametrosService.obterNumero(…, 'ORCAMENTO_DIAS_VALIDADE', 30)` + `updatedAt` da linha em `parametros_empresa`` | Baixa — duas leituras, fora de uma transação comum |

## Fluxo Principal

### 1. 3.1 Valor com padrão em cascata

`obterNumero` (`parametros.service.ts:258`) devolve o padrão **30** quando o parâmetro
não existe, está vazio ou não é número (`Number.isNaN`). O seed (`seed-base.ts:111`) cria
o parâmetro com `tipo: 'numero'`, `tamanho: 3`, `conteudo: '30'`. Em dev, as três empresas
têm `30`.

### 2. 3.2 A validade é só sugestão, aplicada no navegador

O servidor não usa `diasValidade` para nada. Quem aplica é `orcamento-form.tsx:656-668`:
ao **criar**, uma única vez, `dataValidade = hoje + diasValidade` (data local do
navegador); a cópia de orçamento (`copiar`, linha ~1209) reinicia a validade do mesmo
jeito. O vendedor pode trocar a data livremente, e nem `OrcamentosService.create` nem a
API de integração validam a data contra o parâmetro.

### 3. 3.3 `updatedAt` inventado quando não há linha

Sem linha do parâmetro em `parametros_empresa`, a resposta traz
`updatedAt: new Date()` — o instante da consulta, não uma alteração real. Nenhum
consumidor lê `updatedAt` hoje (o formulário usa só `diasValidade`), então o efeito é
nulo; mas o contrato o descreve como "data/hora da última alteração do parâmetro".

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`ParametrosService.obterNumero`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`PrismaService.withTenant`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts (ORCAMENTO_CONFIG_EXAMPLE)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/orcamento-config` | 🟢 |
| **Constante Parametrizada `PARAMETRO_DIAS_VALIDADE`:** `orcamento-config.service.ts:5` (exportada, sem outro importador) | `apps/api/src/modules/orcamento-config` | 🟢 |
| **Constante Parametrizada `DIAS_VALIDADE_PADRAO`:** `orcamento-config.service.ts:6` | `apps/api/src/modules/orcamento-config` | 🟢 |
| **Constante Parametrizada `parâmetro ORCAMENTO_DIAS_VALIDADE`:** `seed-base.ts:111` | `apps/api/src/modules/orcamento-config` | 🟢 |

## Estado Interno e Entidades

- Dados mantidos nas tabelas do módulo com isolamento multi-tenant. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.


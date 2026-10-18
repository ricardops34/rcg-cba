# cliente-campo-config — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `cliente-campo-config`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `obterConfig` | `Mapa campo → editável para toda a lista canônica de campos configuráveis; campo sem linha = editável (default)` | `Result` | 200 OK |
| `atualizar` | `Upsert por campo (`empresaId_campo`) e devolve a config recalculada` | `Result` | 200 OK |

## Fluxo Principal

### 1. 3.1 Lista canônica derivada do schema de Cliente (`CAMPOS_CLIENTE_CONFIGURAVEIS`)

Em `@plataforma/contracts`, a lista de campos configuráveis é `Object.keys(clienteCreateSchema.shape)`
mais `"cnaes"` (que não é coluna do cliente, mas a pergunta "quem pode mexer nisso?" é a
mesma). Decisão deliberada contra duplicar nomes de campo à mão: um campo novo no schema
de Cliente aparece aqui automaticamente, sem exigir um segundo lugar para lembrar de
atualizar.

### 2. 3.2 "Sem configuração = editável" (rollout sem quebra)

`obterConfig` usa `porCampo.get(campo) ?? true` — campo sem linha gravada em
`ClienteCampoConfig` é tratado como editável. Isso permite a lista canônica crescer (novo
campo no cliente) sem precisar de uma migration de dados que insira uma linha para cada
empresa existente; o travamento é opt-in, por empresa.

### 3. 3.3 Reforço server-side, e não só na tela

Quem de fato aplica a trava não é este módulo — é cada serviço de `clientes` que grava
(`ClientesService.update`, `ClienteCnaesService`, `ClientesReceitaLoteService`). O padrão
observado em `ClientesService.update` é **filtrar em silêncio**: campos com
`config[campo] === false` são removidos do `input` antes de aplicar a alteração — a
chamada não falha, apenas ignora o campo travado. Comentário explícito no código do módulo
`clientes` registra que isso existe justamente para quem tentasse forçar via API direta,
não só pela UI.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/cliente-campo-config` | 🟢 |
| **Constante Parametrizada `CAMPOS_CLIENTE_CONFIGURAVEIS`:** universo de campos que podem ser travados | `apps/api/src/modules/cliente-campo-config` | 🟢 |

## Estado Interno e Entidades

- **`ClienteCampoConfig`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.


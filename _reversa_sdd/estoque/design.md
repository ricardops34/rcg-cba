# estoque — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `estoque`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `findAll` | `Listagem agregada por produto, com filtro de armazém/categoria/busca/`comSaldo`, ordenação incluindo por saldo agregado` | `Result` | 200 OK |
| `findByProduto` | `Detalhe de um produto aberto por armazém (não some do total)` | `Result` | 200 OK |

## Fluxo Principal

### 1. 3.1 Regra de "armazém de revenda" como filtro universal

`estoqueFilter`/`AND: [{ armazem: { revenda: true } }]` é aplicado em toda leitura de
estoque da plataforma (listagem, detalhe, ordenação por saldo) — decisão de negócio
datada de 29/09/2026 no comentário do código: só conta o estoque dos armazéns marcados
pelo ERP como de revenda (`MV_BJAPI16` no Protheus). Um armazém não-revenda com saldo
positivo não aparece em lugar nenhum da tela de Estoque.

### 2. 3.2 Visibilidade de armazém/produto inativo condicionada a saldo

Duplo filtro "inativo só aparece com saldo":
- **Armazém**: `OR: [{ armazem: { ativo: true } }, { armazem: { ativo: false }, saldo: { gt: 0 } }]`
  — uma linha de armazém desativado só entra na conta se ainda tiver saldo positivo
  (zerar o saldo tira a linha da leitura, mesmo sem reativar o armazém).
- **Produto**: mesma lógica — produto inativo só aparece na listagem/detalhe se tiver
  saldo em algum armazém de revenda; sem saldo, comporta-se como se não existisse
  (`findByProduto` lança `NotFoundException` mesmo existindo o cadastro).
- Produto também precisa estar em categoria `usado: true` **e** `ativo: true` (marcação
  da plataforma + status do ERP) para entrar na listagem — categoria não "usada" ou
  inativa no ERP tira o produto inteiro, independente de saldo.

### 3. 3.3 `comSaldo` — três modos de filtro sobre a mesma relação `estoques`

- `comSaldo === false`: produto cuja **toda** linha que conta (dentro de `estoqueFilter`)
  está zerada — combinação `some: estoqueFilter` + `every: { OR: [{ NOT: estoqueFilter },
  { saldo: { lte: 0 } }] }` (comentário do código resume como "toda linha que conta está
  zerada"; linha fora do filtro — não-revenda, por exemplo — não entra na verificação).
- `comSaldo === true`: ao menos uma linha dentro do filtro com saldo positivo.
- Sem `comSaldo` mas com `armazemId`: ao menos uma linha no armazém filtrado (sem exigir
  saldo positivo).

### 4. 3.4 Ordenação por saldo agregado — paginação em SQL cru

`sortBy === 'saldoTotal'` não é ordenável pelo Prisma (`ORDER BY` por soma agregada antes
do `LIMIT`): o service primeiro busca os ids candidatos respeitando o `where` de
visibilidade, depois roda um `$queryRaw` que agrega `SUM(e.saldo)` por produto com os
mesmos critérios de armazém revenda/ativo, pagina ali (`LIMIT`/`OFFSET`) e por fim busca
os produtos completos pelos ids ordenados, reordenando o resultado em memória
(`posicoes.get(a.id)! - posicoes.get(b.id)!`) porque o segundo `findMany` não garante a
ordem do `IN`. Testado em `estoque.service.spec.ts` (verifica o SQL gerado e a
reordenação, para `asc`/`desc`).

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/pagination/paginate`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/estoque` | 🟢 |

## Estado Interno e Entidades

- **`Estoque`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`Armazem`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.


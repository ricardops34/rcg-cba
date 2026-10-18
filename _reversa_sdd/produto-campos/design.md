# produto-campos — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `produto-campos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `listar` | `Definições ativas (ou todas) da empresa, ordenadas por `ordem`/`nome`` | `Result` | 200 OK |
| `criar/atualizar/remover` | `CRUD da definição; chave imutável; trava de mudança de tipo com valores preenchidos` | `Result` | 200 OK |
| `valoresDoProduto/valoresDoProdutoTx` | `Formulário do produto: **toda** definição ativa + valor quando houver; recortes `apenasAgente`/`apenasPreenchidos`` | `Result` | 200 OK |
| `gravarValores` | `Grava o formulário inteiro, validando e normalizando cada valor contra o tipo da definição` | `Result` | 200 OK |
| `normalizarValorDoCampo` | `Texto digitado → formato canônico por tipo (número, booleano, data, lista)` | `Result` | 200 OK |

## Fluxo Principal

### 1. 3.1 Chave única mesmo para excluídos (`criar`)

A constraint `@@unique([empresaId, chave])` não distingue excluído: tentar recriar uma
chave de um campo soft-deleted falha no banco. O serviço antecipa isso com uma consulta
própria e devolve mensagem diferente conforme o achado esteja ou não excluído — evita o
usuário tentar de novo a mesma chave sem entender por quê.

### 2. 3.2 Trava de mudança de tipo com valores preenchidos (`atualizar`)

Mudar o `tipo` de um campo já preenchido (`texto` → `numero`, por exemplo) quebraria a
leitura em quem já confia no formato canônico (tela, IA, relatório). `atualizar` conta
`produtoCampoValor` pelo campo antes de aceitar a troca de tipo; havendo qualquer valor
gravado, recusa com `ConflictException` e orienta a criar um campo novo em vez de migrar o
existente. Campo `lista` sempre precisa de ao menos 1 opção (validado tanto aqui quanto no
schema Zod, nas duas entradas — criação e atualização).

### 3. 3.3 Normalização de valor por tipo (`normalizar-valor.ts`)

Módulo isolado "para poder ser testado direto — é a regra mais fácil de quebrar sem
ninguém perceber" (comentário do autor). Entrada tolera o formato local; saída é sempre o
canônico:
- **número**: aceita `1.234,5` (ponto = milhar, vírgula = decimal, formato brasileiro) —
  `Number("1.234,5")` direto daria `NaN`, e sem remover o ponto de milhar o valor sairia
  mil vezes menor. Saída: `Number` convertido para string (ponto decimal).
- **booleano**: aceita `sim/não/s/n/1/0/x/true/false` (case-insensitive); saída sempre
  `"true"`/`"false"` literal.
- **data**: aceita `DD/MM/AAAA` (o que a pessoa digita) e ISO (o que `<input type="date">`
  manda); valida que a data não "rolou" — `new Date('2026-02-31')` não lança em JS, apenas
  avança para 03/03, então o código recompara o ISO resultante com o original para pegar
  dias inexistentes.
- **lista**: compara a opção sem diferenciar maiúscula, mas grava **como cadastrada** —
  evita o mesmo valor aparecer de formas diferentes ao filtrar depois.
- Qualquer valor que não valida lança `BadRequestException` com o nome do campo na
  mensagem — nunca grava um valor que não bate com o tipo.

### 4. 3.4 `gravarValores` — formulário inteiro, apagar por valor vazio

Recusa (não ignora) campo inexistente/excluído/desativado referenciado no payload — do
contrário a tela diria "salvo" com o valor não gravado. Valor vazio e campo obrigatório →
`BadRequestException`; valor vazio e campo opcional → `deleteMany` do valor (limpar um
campo não precisa de rota própria). Valor não vazio passa por `normalizarValorDoCampo`
antes do `upsert` (chave composta `empresaId_produtoId_campoId`).

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
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/produto-campos` | 🟢 |
| **Constante Parametrizada `produtoCampoTipoSchema`:** tipos de campo complementar | `apps/api/src/modules/produto-campos` | 🟢 |
| **Constante Parametrizada `produtoCampoChaveSchema (regex)`:** formato da chave estável, referenciada pela IA/integrações | `apps/api/src/modules/produto-campos` | 🟢 |
| **Constante Parametrizada `opcoes`:** opções de campo `lista` | `apps/api/src/modules/produto-campos` | 🟢 |
| **Constante Parametrizada `produtoCamposGravarSchema.valores`:** tamanho do payload de gravação em lote | `apps/api/src/modules/produto-campos` | 🟢 |

## Estado Interno e Entidades

- **`ProdutoCampo`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`ProdutoCampoValor`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.


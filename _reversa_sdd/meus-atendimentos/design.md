# meus-atendimentos — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `meus-atendimentos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `resumo — GET /meus-atendimentos` | ``meus-atendimentos.visualizar`` | `feed paginado por cursor + contadores do período; `dias?`, `clienteId?`, `escopo` (`proprio`/`equipe`), `cursor?`, `limite`` | 200 OK |
| `carteiras (privada)` | `—` | ``proprio` = vendedor ligado ao login; `equipe` = escopo **menos** ele mesmo (escopo livre = todos os vendedores ativos)` | 200 OK |
| `vazio (privada)` | `—` | `resposta zerada para quem não tem vendedor nem equipe` | 200 OK |
| `codificarCursor / decodificarCursor` | `—` | ``base64url("<ISO>` | <id>")`; cursor ilegível = sem cursor |
| `categoriaDoTitulo (exportada)` | `—` | `classifica a atividade pela frase do título` | 200 OK |

## Fluxo Principal

### 1. 3.1 Janela de dias

`dias` conta dias inteiros **incluindo hoje**: `de = hoje − (dias − 1)` às 00:00,
`ate = agora`. Sem `dias` o feed não tem começo. Contrato: 1 a 365
(`DIAS_MAX_HISTORICO`); o agente limita a 1–7.

### 2. 3.2 De quem

- `proprio` (padrão): `vendedorId = proprio` **ou** `createdBy = usuário`. A segunda
  metade é o que o supervisor ou gerente executou na carteira do subordinado, onde o
  registro fica.
- `equipe`: `vendedorId IN equipe`. Só vale se `equipe` não estiver vazia; senão cai
  em `proprio`, e o service decide (o agente não consegue ampliar o alcance).
- Sem vendedor e sem equipe: resposta vazia, nunca a de outra pessoa.

### 3. 3.3 No período

`dataConclusao` dentro da janela **ou** `createdAt` dentro da janela: um retorno
agendado hoje para a semana que vem conta como trabalho de hoje.

### 4. 3.4 `AND` em vez de `OR` na raiz

Todas as condições compostas entram em `AND`. A versão anterior tinha o escopo num
`OR` de raiz, e o `OR` do cursor sobrescrevia a chave no spread. Da segunda página em
diante, o feed devolvia atividade de **qualquer** vendedor da empresa. Corrigido; o
comentário no código registra o porquê.

### 5. 3.5 Paginação por cursor

Ordem `createdAt desc, id desc`; busca `limite + 1` linhas, e a linha a mais indica que
há próxima página. Cursor = (`createdAt`, `id`) do último item, com desempate por id.
`quando` mostrado = `dataConclusao ?? createdAt`.

### 6. 3.6 Contadores do topo

Contam o **período inteiro**, não a página, numa segunda consulta com até
`TETO_TOTAIS` = 5000 linhas (só `titulo` e `clienteId`): `registros`, `clientes`
distintos e um contador por categoria.

### 7. 3.7 Categoria pelo título

| Regra (título em minúsculas) | Categoria |
|---|---|
| começa com "atendimento por whatsapp" | `whatsapp` |
| contém "orçamento" ou "proposta" | `orcamento` |
| contém "2ª via", "danfe", "boleto", "xml", "títulos em aberto" ou "notas fiscais" | `documento` |
| qualquer outro | `agenda` |

A tabela não tem coluna de origem. O spec amarra os títulos fixos dos três helpers
(`registrar-atendimento-whatsapp`, `registrar-atividade-documento`,
`registrar-atividade-orcamento`).

### 8. 3.8 Achados

- 🟡 **Categoria por texto livre.** A atividade digitada à mão com "orçamento",
  "proposta" ou "boleto" no título ("Ligar sobre o orçamento") sai como
  `orcamento`/`documento`, não `agenda`. Os registros automáticos que não vêm dos três
  helpers caem em `agenda`, entre eles "Comodato baixado", "Alteração de cadastro
  aguardando aprovação" e o "Retorno: <título>" do orçamento (a menos que o título do
  orçamento contenha a palavra). O mesmo problema do módulo `atividades`: falta uma
  coluna de origem.
- 🟡 **"Hoje" no fuso do servidor.** `setHours(0,0,0,0)` usa o fuso do processo Node.
  Em container UTC, "hoje" começa às 20:00 do dia anterior em Campo Grande. É a mesma
  lacuna de fuso de `atividades`.
- 🟡 **O teto não aparece na resposta.** Com mais de 5000 registros os contadores param
  em 5000, sem nenhum campo que diga isso. O comentário fala em "mais de", mas a
  resposta não traz esse sinal.
- 🟡 **Documentação divergente.** O `summary` da rota diz "1 a 7 dias", mas o contrato
  aceita até 365 ou nenhum recorte. O limite de 7 é só do agente.
- 🟡 Na visão `equipe` com escopo livre, ficam de fora as atividades de vendedores
  **inativos** (`ativo: true` em `carteiras`).
- 🟡 Pendências criadas no período aparecem como "o que fiz", com `quando = createdAt`.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/escopo/escopo-vendedores`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/meus-atendimentos` | 🟢 |

## Estado Interno e Entidades

- Dados mantidos nas tabelas do módulo com isolamento multi-tenant. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.


# notificacoes — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `notificacoes`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `feed — GET /notificacoes` | `só JWT` | `não lidas do usuário, sem `whatsapp_mensagem` (decisão de 08/10/2026); total + 20 mais recentes por `ocorridaEm`` | 200 OK |
| `marcarLida — POST /notificacoes/:id/lida` | `só JWT` | ``updateMany` com `usuarioId` no filtro; repetir conta como sucesso; id alheio dá 404` | 200 OK |
| `marcarTodasLidas — POST /notificacoes/lidas` | `só JWT` | `todas do usuário` | 200 OK |
| `registrarNotificacao(tx, n)` | `—` | `upsert atômico (`INSERT … ON CONFLICT` no índice parcial)` | 200 OK |
| `marcarNotificacoesDaOrigem(tx, …)` | `—` | `fecha as pendentes de uma origem (conversa aberta, atividade concluída)` | 200 OK |
| `usuarioDoVendedor(tx, …)` | `—` | `destinatário de tudo que é da carteira; vendedor sem login → `null` (não notifica)` | 200 OK |
| `NotificacoesVarreduraService.varrer` | `timer 30 min + uma vez no boot` | `atividades vencidas e títulos vencidos, empresa a empresa` | 200 OK |

## Fluxo Principal

### 1. 3.1 Deduplicação — `registrarNotificacao`

- Autor = destinatário → não grava.
- Índice único **parcial** `notificacoes_pendente_por_referencia`
  `(empresaId, usuarioId, tipo, referenciaId) WHERE lidaEm IS NULL AND referenciaId IS
  NOT NULL`: só uma pendente por origem. Sem `referenciaId`, sempre insere.
- `acumular=true` (fato que se soma): `contador+1` e `ocorridaEm` novo (volta ao topo).
  `false` (fato reafirmado): mantém o contador e a data. Título, descrição e rota são
  sempre reescritos.
- `ON CONFLICT` em vez de "procura e grava": duas gravações simultâneas não derrubam a
  transação de quem provocou o fato.

### 2. 3.2 Atividade vencida

Atividade aberta, ativa, com vencimento **até o fim de hoje**, de vendedor com login, que
**nunca** foi avisada (`jaAvisados`, lidas ou não, para a janela andar e não ressuscitar
o que o usuário limpou). Lote de 200 por empresa, as mais antigas primeiro.
`ocorridaEm` = data do prazo; rota `/crm/atividades/:id`. Depois, fecha as notificações
de atividades concluídas, inativas ou excluídas.

### 3. 3.3 Título vencido — uma linha por cliente

- Agrega no banco por (cliente, usuário do vendedor): quantidade, total, mais antigo e
  `novidadeEm = MAX(GREATEST(vencimento, createdAt))`. O `createdAt` entra porque o
  import do ERP traz parcela já vencida.
- Corte "vencido": `vencimento < calendario.corteVencidos(hoje)`, considerando os dias
  úteis com feriados.
- Só vendedor `tipo='vendedor'`, ativo, não desligado, com login. Supervisor, gerente e
  os cadastros de sistema ficam de fora.
- Lote de 200 **clientes**, os mais atrasados primeiro.
- Não insiste: se o usuário leu e nada venceu nem entrou depois (`ultimaLeitura ≥
  novidadeEm`), pula. Senão faz o upsert, que reescreve a contagem e o total da linha
  pendente. Título: razão social; descrição: "N títulos vencidos · R$ X"; rota
  `/comercial/posicao-cliente/:clienteId`.
- Fecha a linha do cliente que não tem mais título vencido daquele usuário. Isso também
  aposenta as notificações do desenho antigo, uma por título.

### 4. 3.4 Achados

- 🟡 **`jaAvisados` cresce sem limite.** A cada 30 min, para cada empresa, carrega
  **todos** os `referenciaId` já notificados do tipo e os passa num `notIn`. Sem
  retenção na tabela, a consulta piora com o tempo.
- 🟡 **Atividade reatribuída não avisa o novo dono.** `jaAvisados` não considera o
  `usuarioId`: se a atividade já gerou aviso para o vendedor anterior, o novo nunca
  recebe.
- 🟡 **"Fim de hoje" no fuso do servidor.** `setHours(23,59,59)` usa o fuso do processo,
  a mesma lacuna de `atividades`.
- 🟡 **Três gravações por fora do `registrarNotificacao`.** `sugestao-compra`,
  `clientes-receita-lote` e `whatsapp-recado` usam `tx.notificacao.create` e não passam
  pela deduplicação nem pela regra "autor = destinatário".
- 🟡 Não há limpeza de notificações lidas antigas.
- 🟡 `Promise.all` dentro da transação interativa (`feed`).

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/horario/calendario-util`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/notificacoes` | 🟢 |

## Estado Interno e Entidades

- **`Notificacao`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.


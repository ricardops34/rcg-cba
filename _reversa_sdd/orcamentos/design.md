# orcamentos — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `orcamentos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `precoProduto(empresaId, user, clienteId, produtoId)` | `cliente + produto` | ``vlrTabela`, `ultimoPreco`, `saldoEstoque`, `regraDesconto` (faixas ocultas se sem permissão de comissão)` | Média |
| `findAll(empresaId, user, query, opcoes?)` | `filtros (status, cliente, oportunidade, vendedor, origem, busca, datas) + paginação` | `lista paginada com comissão ocultada conforme parâmetro` | Média |
| `findOne(empresaId, user, id, opcoes?)` | `id` | `orçamento completo com itens` | Baixa |
| `update(empresaId, user, id, input)` | `id + campos parciais` | `orçamento atualizado; 409 se `aprovado`/`expirado`` | Alta — mesma orquestração de `create`, mais as travas de status e derrubada de autorização |
| `remove(empresaId, user, id)` | `id` | `soft delete; 409 se integrado ao ERP (`podeExcluirOrcamento`)` | Baixa |
| `solicitarAutorizacaoDesconto/autorizarDesconto` | `id` | `orçamento atualizado; 409 se já autorizado ou se nenhum item exige` | Média — duas etapas do fluxo de desconto (§3.3) |
| `gerarPdf(empresaId, quem, id, opcoes?)` | `id` | ``{conteudo: Buffer, nomeArquivo, numero}`; 409 se desconto pendente de autorização` | Alta — monta dados fora/dentro da transação, delega a `montarOrcamentoPdf` |
| `calcularItensOrcamento (arquivo próprio, compartilhado)` | `itens + cliente + vendedor` | `itens com `vlrTabela`/`percDesconto`/`vlrDesconto`/`vlrTotal`/`percComissao` calculados` | Alta — ver §3.1 |
| `registrarAtividadeOrcamento/orcamentoExigeAutorizacao (arquivo próprio)` | `evento + dados do orçamento` | `grava `Atividade` no histórico; resolve destinatário da pendência` | Média — ver §3.2/§3.3 |

## Fluxo Principal

### 1. 3.1 `calcularItensOrcamento` — preço, desconto e comissão nunca vêm do cliente

O vendedor informa só `produtoId`/`quantidade`/`vlrUnitario` por linha; o servidor
recalcula tudo o mais a partir da Tabela de Preço resolvida para o cliente
(`resolverTabelaPrecoCliente` — cai na tabela padrão de capital/interior quando a do
cadastro está vazia/inativa):
- `vlrTabela`: preço da tabela, ou `null` se não há tabela aplicável/preço cadastrado —
  nesse caso `vlrUnitario` informado vale do mesmo jeito, sem desconto calculado.
- `vlrDesconto`/`percDesconto`: só quando `vlrTabela > vlrUnitario` (desconto real, não
  acréscimo).
- `percComissao`: resolve a regra de desconto aplicável (`resolverRegrasDescontoDosItens`
  — ordem tabela de preço > produto > categoria > regra padrão) e aplica
  `calcularComissaoItem` (`@plataforma/contracts`) sobre o `percComissao` **base** do
  cadastro do vendedor — sem percentual base cadastrado, a comissão da linha fica `null`
  (não apurada), nunca `0` (zero seria "apurada e é zero").
- Parâmetro `DESCONTO_ACIMA_LIMITE_BLOQUEIA` (por empresa): desligado (default), desconto
  acima do máximo da regra só vira aviso (`comissao.acimaDoMaximo`) na resposta; ligado,
  `calcularItensOrcamento` lança `BadRequestException` e a gravação é recusada na hora —
  nunca grava e avisa depois.
- Valor de `percComissao`/`regraDescontoId` vindo do **payload** prevalece quando
  presente — só a API de integração (ERP é dono do número) informa isso; pela tela, nada
  vem preenchido e vale sempre o cálculo.

### 2. 3.2 Vendedor do orçamento é sempre o do cadastro do cliente, nunca escolha livre

`create`: `vendedorId` do payload só é usado quando o cliente **não tem** vendedor
vinculado; havendo vendedor no cadastro, ele prevalece sobre qualquer coisa enviada.
`update`: o vendedor **não muda por edição simples** — só muda junto com uma troca de
`clienteId` (`clienteTrocado && vendedorDoCliente`), e aí herda o vendedor do novo
cliente. Em ambos, `garantirVendedorNoEscopo` barra (404) se o vendedor resolvido cair
fora do escopo hierárquico de quem está fazendo a chamada — mesmo que o payload não
tenha pedido aquele vendedor explicitamente.

`origemDaVenda` registra **quem de fato montou** o orçamento, separado de quem é "dono"
da carteira (`vendedorId`): se o usuário logado é o próprio vendedor do cliente →
`'vendedor'`; senão, `isAdmin` (Administrador/Diretor) ganha de qualquer cargo cadastrado
→ `'administrador'` (comentário explícito: mesmo um admin com cadastro de vendedor como
gerente, a venda que ele faz na carteira alheia é da administração, não da gerência
comercial); senão, cargo `'superior'` no cadastro → `'superior'`; qualquer outro caso
(administrativo/financeiro sem cadastro de vendedor, ou vendedor mexendo fora da própria
carteira por escopo permissivo) → `'administrador'`. Isto é o que separa comissão/leitura
de desempenho de "o vendedor vendeu" vs. "o supervisor vendeu pelo vendedor".

### 3. 3.3 Autorização de desconto em duas etapas, e o que a derruba

`orcamentoExigeAutorizacao` lê o que está **gravado** nos itens (`percDesconto` +
`regraDesconto.percDescontoMaximo`), não o que veio na requisição — o que trava é o
orçamento como ficou no banco. Fluxo:
1. `solicitarAutorizacaoDesconto`: 409 se já autorizado, 409 se nenhum item exige;
   senão grava `descontoSolicitadoEm/Por` e abre uma `Atividade` pendente
   (`autorizacao_solicitada`) na agenda de **quem cobra o vendedor** — o superior
   (`Vendedor.superiorId`); sem superior cadastrado, a pendência fica com o próprio
   vendedor (comentário: "melhor uma pendência visível na agenda dele do que uma
   atividade órfã").
2. `autorizarDesconto`: mesmas duas travas de 409; grava `descontoAutorizadoEm/Por`,
   **fecha** a atividade de pendência aberta na etapa 1 (`updateMany` por título +
   `concluida: false`) e registra o evento `autorizacao_concedida`.
3. PDF (`gerarPdf`) e efetivação (`update` para `status: 'aprovado'`) checam
   `orcamentoExigeAutorizacao` e recusam com 409 se não houver `descontoAutorizadoEm`.
4. **Mexer nos itens derruba a autorização**: `update`, ao receber `itens`, zera as
   quatro colunas de solicitação/autorização — comentário explícito: "a autorização foi
   dada para aqueles preços... senão daria para autorizar 15% e gravar 40% depois". O
   vendedor precisa solicitar de novo se o novo desconto ainda passar do máximo.
5. Criar já com `status: 'aprovado'` passa pela **mesma trava** de `orcamentoExigeAutorizacao`
   — não há atalho para nascer aprovado com desconto fora do limite.

### 4. 3.4 Status é uma máquina de estado com dois becos sem saída

`update` recusa (409) alterar orçamento `aprovado` ("efetivado", sem volta por esta rota)
e `expirado` ("registro histórico... o caminho é copiar, que gera um novo orçamento com
validade reiniciada" — a cópia em si não foi encontrada neste módulo, é lógica de
tela/outro endpoint). Comentário no código nota que, como a guarda já recusou alterar um
`aprovado`, chegar à transição `status === 'aprovado'` dentro de `update` **sempre** é uma
transição nova (nunca re-aprovação) — por isso o evento de atividade correspondente
(`aprovacao_cliente`) é seguro de disparar sem checar o status anterior.

### 5. 3.5 Resposta do cliente (aprovação/recusa) é evento próprio, não "alteração"

`update` ramifica o evento de histórico conforme o novo `status`: `'aprovado'` →
`aprovacao_cliente`; `'recusado'` (e só se **não estava** já recusado — evita duplicar o
evento numa segunda edição) → `recusa_cliente`; qualquer outra mudança →
`alteracao` genérica. `registrarAtividadeOrcamento` aproveita esses dois eventos
específicos para também disparar uma `Notificacao` no sino do **vendedor dono**
(`usuarioDoVendedor`) — mas só quando quem registrou a resposta **não é** o próprio
dono (`autorUsuarioId: autor` na notificação; comentário: "quem registrou a resposta do
cliente não precisa ser avisado dela — o aviso existe para quando outra pessoa mexe no
orçamento do vendedor").

### 6. 3.6 `numero` sequencial é reservado atomicamente, fora do ciclo de vida do registro

`proximoNumeroOrcamento`: um único `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`
lê-e-incrementa o contador `orcamento_config.ultimoNumero` numa instrução atômica —
duas criações simultâneas na mesma empresa serializam no lock da linha do contador, nunca
saindo com o mesmo número (o índice único `(empresaId, numero)` é a rede de segurança
redundante). O `INSERT` também cobre a empresa que ainda não tem linha de config. Função
compartilhada com a API de integração — os dois caminhos de criação de orçamento usam o
mesmo contador.

### 7. 3.7 Validade do orçamento: dias corridos, só o último dia pula fim de semana/feriado

`ajustarValidadeOrcamento` (`validade-orcamento.ts`) carrega o calendário útil da empresa
(`carregarCalendarioUtil`) e ajusta **só a data final informada** para o próximo dia útil
quando ela cai em fim de semana ou feriado — mantendo os dias corridos do prazo, não
reduzindo a janela. Testado para sábado seguido de feriado na segunda (pula para terça),
mudança de ano com feriado, e preservação de data sem deslocar por fuso (comentário no
teste aponta bug passado: "sem isso, o vencimento voltava um dia"). `null`/`undefined`
passam direto, sem consultar feriados.

### 8. 3.8 PDF: dados resolvidos em duas fases (transação + fora dela), DANFE-like

`gerarPdf` resolve o básico (busca por escopo via `QuemPede`/`recorteDoSolicitante` —
mesmo mecanismo de duas origens de `notas-saida`, usuário logado ou cliente via
WhatsApp) e registra o evento **dentro** da transação de tenant; busca a `Empresa`
emitente **fora** dela (mesmo padrão do DANFE — `Empresa` não é tabela de tenant).
`montarOrcamentoPdf` (`orcamento-pdf.ts`) é o layout — cabeçalho com logo + dados da
empresa, bloco do cliente, condições comerciais, tabela de itens via `jspdf-autotable`
(pagina sozinho), total, observação opcional, rodapé com paginação em todas as folhas.
Diferenças deliberadas da versão anterior no navegador (comentário no código): sem
`<canvas>` para normalizar formato de logo (aqui só PNG/JPEG — outro formato sai sem
logo) e recebe `number` puro (quem chama já converteu `Decimal` do Prisma). Fotos de
produto são opcionais por parâmetro (`PARAMETRO_ORCAMENTO_EXIBIR_FOTOS`) e por imagem
existir/ser PNG-JPEG; falha ao ler um arquivo de foto é engolida (`catch` → `null`), nunca
derruba a geração do PDF inteiro.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ParametrosService (DESCONTO_ACIMA_LIMITE_BLOQUEIA, PARAMETRO_ORCAMENTO_EXIBIR_FOTOS, COMISSAO_OCULTA_PARA_TODOS)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`resolverEscopoVendedores + combinarFiltroVendedor (common/escopo)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`QuemPede + recorteDoSolicitante + autorDoEvento (common/escopo/quem-pede)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`resolverTabelaPrecoCliente + resolverRegrasDescontoDosItens (common/precos)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/permissoes/pode-ver-comissao`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/horario/calendario-util`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/pdf/carregar-logo`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/uploads/uploads.config`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`modules/notificacoes (registrarNotificacao, usuarioDoVendedor)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`jspdf + jspdf-autotable`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/orcamentos` | 🟢 |
| **Constante Parametrizada `SORT_FIELDS`:** whitelist de ordenação; fora da lista cai em `createdAt` | `apps/api/src/modules/orcamentos` | 🟢 |
| **Constante Parametrizada `DESCONTO_ACIMA_LIMITE_BLOQUEIA (ParametrosService)`:** liga a recusa de gravação (em vez de só aviso) quando desconto passa do máximo da regra | `apps/api/src/modules/orcamentos` | 🟢 |
| **Constante Parametrizada `PARAMETRO_ORCAMENTO_EXIBIR_FOTOS (ParametrosService)`:** inclui coluna de foto do produto na tabela do PDF | `apps/api/src/modules/orcamentos` | 🟢 |
| **Constante Parametrizada `COMISSAO_OCULTA_PARA_TODOS (ParametrosService)`:** zera as faixas da regra de desconto e oculta comissão dos itens na resposta | `apps/api/src/modules/orcamentos` | 🟢 |
| **Constante Parametrizada `OrigemVenda (enum)`:** ver §3.2; histórico anterior a 02/09/2026 todo gravado como `vendedor` (não dá para recuperar quem digitou) | `apps/api/src/modules/orcamentos` | 🟢 |
| **Constante Parametrizada `StatusOrcamento (enum)`:** máquina de estado — ver §3.4 | `apps/api/src/modules/orcamentos` | 🟢 |
| **Constante Parametrizada `SituacaoErpOrcamento (enum)`:** gravada só pela integração (fora deste módulo); `faturado_parcial` exibido como "Faturando" na tela (decisão de 29/09/2026) | `apps/api/src/modules/orcamentos` | 🟢 |

## Estado Interno e Entidades

- **`Orcamento`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`OrcamentoItem`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`OrcamentoConfig`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.


---
goal: Plano único da integração ERP Protheus ↔ Plataforma BJ — os dois lados, do que já foi entregue ao que falta
version: 4.0
date_created: 2026-09-01
last_updated: 2026-09-18
owner: Ricardo P Sotomayor
status: 'In progress'
tags: [architecture, feature, integracao, protheus, advpl, api]
---

# Integração ERP ↔ Plataforma BJ — plano único

## 0. Mapa dos documentos

**Vivos — consulte:**

| Documento | Papel |
|---|---|
| **Este arquivo** | Plano da integração inteira. Estado, decisões, o que falta |
| `Portal/BJ/README.md` | Referência dos quatro fontes, estrutura SZY/SZZ, catálogo, decisões de desenho e instalação |
| `C:\VPS\rcg\docs\integração\README.md` | Contrato da API: autenticação, tenant, upsert, erros, paginação, ordem de carga |
| `C:\VPS\rcg\docs\integração\endpoints.md` | Referência rota a rota |
| `C:\VPS\rcg\docs\integração\swagger.md` | Padrão obrigatório ao criar endpoint novo |
| `C:\VPS\rcg\docs\integração\testes-swagger.json` | Payloads de teste na ordem de carga |
| `C:\VPS\rcg\docs\planos\compras-notas-entrada.md` | Registro da entrega de fornecedores e notas de entrada **do lado da plataforma** |

---

## 1. A integração em uma página

```text
        ERP (Protheus)                          Plataforma (BJ)
 ┌──────────────────────────┐            ┌──────────────────────────┐
 │ SB1 SA1 SA3 SF2 SE1 SCJ… │            │  /api/v1/integracao/…    │
 │          │               │            │        x-api-key         │
 │   S_T_A_M_P_ diz o que   │            │                          │
 │        mudou             │            │                          │
 │          ▼               │            │                          │
 │  ① coleta → enfileira    │            │                          │
 │          ▼               │  POST      │                          │
 │      ╔═══════╗           │  DELETE    │                          │
 │      ║  SZZ  ║ ② drena ──┼───────────▶│  upsert por codigoErp    │
 │      ║ fila  ║           │            │                          │
 │      ╚═══════╝ ③ retorno │  GET/PATCH │  orçamentos/pendentes    │
 │          ▲───────────────┼◀───────────│  (aprovados na tela)     │
 │          │               │            │                          │
 │  MATA410 cria o Pedido   │            │                          │
 └──────────────────────────┘            └──────────────────────────┘
```

**A fila é o centro.** Toda mensagem — de ida e de volta — é gravada na SZZ antes
de ser processada. Foi a decisão que definiu esta versão da integração: na
anterior, quem detectava a mudança era quem fazia o HTTP, e o resultado só
existia enquanto aquele laço rodava. Daí nasciam todos os controles paralelos —
marca d'água que não podia avançar, arquivos de erro, contagem estimada no
monitor. Cada um existia para compensar o fato de a mensagem não ter onde morar.

**Detectar e enviar são agendamentos separados**, porque têm ritmos diferentes:
varrer SB1/SA1/SF2 é caro e não precisa ser frequente; drenar é limitado pela API.
Juntos, uma carga grande bloqueia a próxima varredura.

---

## 2. Requirements & Constraints

### Requisitos funcionais

- **REQ-001**: Toda mensagem enviada à plataforma e toda mensagem recebida dela é gravada na SZZ antes de ser processada.
- **REQ-002**: Um agendamento varre as tabelas de origem por `S_T_A_M_P_` e enfileira as mensagens de saída, sem enviá-las.
- **REQ-003**: Um agendamento drena a fila de saída e executa as requisições.
- **REQ-004**: Um agendamento lê as pendências da plataforma, enfileira, aplica no ERP e atualiza o status na plataforma.
- **REQ-005**: Um monitor lista as mensagens da fila com status, payload e resposta, e permite reenvio dirigido. ~~Número de tentativas~~ — o contador saiu da fila em 17/09/2026.
- **REQ-006**: Uma rotina agendável expurga mensagens executadas acima do prazo de retenção. Pendentes e com erro nunca são apagadas.
- **REQ-007**: Antes de criar o Pedido de Venda a partir do que veio da plataforma, a rotina consulta a fila; mensagem já executada para aquele id não gera outro pedido, apenas reenvia o aviso à plataforma.
- **REQ-008**: A integração cobre **todas as entidades que a API expõe**. Entidade documentada e não mapeada é lacuna, não escopo — hoje faltam `fornecedores` e `notas-entrada` (Phase 7).

### Restrições

- **CON-001**: A gravação da mensagem como executada acontece **dentro do mesmo `Begin Transaction`** do ExecAuto que gerou o documento. Ver **RISK-001**.
- **CON-002**: ~~Nada existente é alterado enquanto o trabalho corre.~~ **Encerrada em 08/09/2026** — os `BJIN*` foram movidos para `Portal/BJ/Remover/` e a restrição perdeu objeto.
- **CON-003**: **Nomes de arquivo são sequenciais**: `BJPLA002.prw` a `BJPLA005.prw` (`BJPLA001.prw` foi removido em 17/09/2026 — ver a seção daquele dia) (`BJPLA006.prw` foi removido em 08/09/2026 pois todas as tabelas já possuem a coluna `S_T_A_M_P_` no banco de dados e a alteração dinâmica de schema é proibida).
- **CON-004**: ~~`U_BJPLA001` tem exatamente 10 caracteres, o limite do RPO~~ — **a restrição não procede neste ambiente**: o próprio repositório tem `User Function` de até 12 caracteres compilando (`PE01NFESEFAZ`, `POR_ATUSA1`). `U_BJRETORNO`, com 11, está dentro do que a base já usa.
- **CON-005**: A tabela de fila é a **SZZ**, prefixo de campo `ZZ_`.
- **CON-006**: A API limita **60 req/min** nas rotas de integração e **120 req/min** no envio de XML, contados **por IP** — duas chaves do mesmo IP dividem o balde. O lote (`PUT`) tem o mesmo teto de requisições, mas leva até 1.000 registros em cada uma.
- **CON-007**: Os arquivos-fonte são gravados em **CP-1252**, nunca UTF-8. Os `.md` são UTF-8.
- **CON-008**: **`codigoErp` é a única chave que atravessa a fronteira.** O uuid da plataforma é interno e nunca sai, exceto no `PATCH /orcamentos/pendentes/{id}`. Ver seção 3.
- **CON-009**: **Sem include próprio.** A integração não tem `.ch` — nem `BJPLA.CH`, nem qualquer outro. Os fontes incluem apenas `totvs.ch`. Não há `#Define` para compartilhar: sentido e status são literais no ponto de uso e os ajustes são parâmetros `MV_BJAPI*`.

### Padrões obrigatórios

- **PAT-001**: **Nomes dizem o que a função faz.**
- **PAT-002**: **Nunca envelopar função nativa do AdvPL.** Nenhuma função pode ter como corpo só uma chamada a `SuperGetMV`, `Sleep`, `AllTrim`, `cValToChar`, `FWTimeStamp` ou equivalente. Chame a nativa no ponto de uso, mesmo repetindo.
- **PAT-003**: **Sem `Function`.** Só `User Function` e `Static Function`.
- **PAT-004**: `FWRest` para consumir a API, exceto PATCH — `FWRest` não implementa o verbo, e aí é `HTTPQuote`.
- **PAT-005**: `FWExecStatement` em toda query. O filtro de `D_E_L_E_T_` é **explícito**: a varredura precisa enxergar o registro excluído para gerar o `DELETE`, então escreva a condição que você quer, nunca uma tautologia.
- **PAT-006**: `FWLogMsg()` para log. Nunca `ConOut()`.
- **PAT-007**: `If/Else/EndIf` explícito. Nunca `IIf()`.
- **PAT-008**: Nenhuma chamada de UI dentro de `Begin Transaction`.
- **PAT-009**: Bloco `/*/{Protheus.doc}` em toda função, com `@type`, `@author`, `@since`, `@param` e `@return`.
- **PAT-010**: `Destroy()` para liberar objeto que tenha o método. Nunca `FwFreeObj()`.

### Diretrizes de legibilidade

> **Execução:** os ajustes de legibilidade foram feitos em 08/09/2026 e refeitos
> em 17/09/2026 — ver a seção *Reescrita para leitura humana* no topo deste plano.



**Decisão de 08/09/2026:** os fontes AdvPL do BJ devem ser fáceis de ler por
um desenvolvedor Protheus. A regra de negócio deve aparecer no fluxo, usando
a linguagem e o framework existentes. Não reinventar o AdvPL nem criar uma
biblioteca particular que o leitor precise aprender para manter a integração.

Estas diretrizes são obrigatórias para novas implementações, correções e
refatorações em BJ. Registrá-las não significa que os fontes atuais já foram
adequados; a conformidade deve ser verificada a cada alteração.

#### Referências de escrita

| Fonte de referência | O que aproveitar no BJ |
|---|---|
| [IMPPED.prw](../../Faturamento/Maxima/IMPPED.prw) — GRVPED | Fluxo visível: ler dados, localizar cadastros, montar cabeçalho e itens, executar a rotina padrão e tratar o resultado. Campos de destino próximos dos valores de origem |
| [SINCMAX.prw](../../Faturamento/Maxima/SINCMAX.prw) — ProcMax e MXTABVLI | Lista explícita das entidades e rotas; reutilização de uma operação completa de sincronização |
| [FuncXMaxima.prw](../../Faturamento/Maxima/FuncXMaxima.prw) — MaxLogin e MaxPost | Separação de operações reais: autenticar e enviar uma requisição com tratamento da resposta |

Esses fontes são referências de estrutura e intenção de escrita. As regras de
negócio da Máxima não são automaticamente requisitos do BJ. Trechos legados,
código comentado, variáveis implícitas e APIs proibidas pelas regras atuais
não devem ser reproduzidos. A referência não autoriza alterar esses três fontes.

#### Como escrever os fontes BJ

- **GUD-001**: Manter a sequência principal legível no próprio fonte. Quem lê deve identificar entrada, validação, transformação, gravação ou envio e tratamento do resultado sem percorrer uma cadeia de auxiliares triviais.
- **GUD-002**: Organizar as funções pela ordem de uso do fluxo. Separar entrada por menu ou agendamento do processamento compartilhado quando houver diferença real de contexto.
- **GUD-003**: Nomear funções pela operação que realizam, como processar, gravar ou atualizar um pedido. Respeitar PAT-001; não usar sufixos opacos como BJI003V para indicar apenas o arquivo de origem.
- **GUD-004**: Usar diretamente as funções nativas e APIs do framework. Não criar auxiliares que apenas renomeiem uma chamada ou uma sequência trivial de conversões; repetir uma expressão curta é aceitável quando deixa a operação evidente.
- **GUD-005**: Extrair uma função quando ela representar uma responsabilidade concreta: uma regra de negócio, uma consulta com propósito definido ou uma operação completa. Não fragmentar uma rotina somente para reduzir o número de linhas ou uma métrica de complexidade.
- **GUD-006**: Manter próximos o campo de origem, sua transformação e o campo de destino. Na montagem de cabeçalho, itens e JSON, deixar o mapeamento visível e alinhado para facilitar a conferência humana.
- **GUD-007**: Preferir If/Else/EndIf, For e While explícitos. Não introduzir macros, classes, callbacks ou despachos dinâmicos quando chamadas diretas resolvem o fluxo com clareza. Codeblocks exigidos pelo framework continuam apropriados.
- **GUD-008**: Declarar variáveis com escopo explícito e notação húngara. Usar Local por padrão; Private somente quando o contexto chamado exigir, como variáveis de controle do ExecAuto.
- **GUD-009**: Comentar decisões, exceções, contratos e motivos de regras de negócio. Evitar repetir em prosa o que a instrução já informa, narrativas extensas e blocos de implementação desativada. Manter o ProtheusDOC obrigatório, objetivo e coerente com a assinatura.
- **GUD-010**: Reutilizar as rotinas padrão do Protheus para efetivar operações de negócio e as APIs do framework para acesso encapsulado. Não implementar mecanismos próprios de dicionário, numeração ou conversão quando já houver recurso adequado e validado.
- **GUD-011**: Concentrar o compartilhamento onde há trabalho real em comum, como autenticação e tratamento HTTP. Não acrescentar camadas genéricas para necessidades hipotéticas. A separação existente entre coleta, fila, envio, retorno e monitor deve continuar representando responsabilidades concretas.
- **GUD-012**: Simplificar preservando os requisitos: filial, chaves, validações, transações, idempotência, tentativas e tratamento de falhas. Código legível precisa tornar essas garantias verificáveis. APIs externas continuam sujeitas à validação documental e às regras do projeto.

#### Critérios de revisão e aceite

Antes de considerar uma alteração dos fontes BJ concluída, verificar:

- [ ] Um desenvolvedor AdvPL consegue acompanhar o caminho do dado até o resultado.
- [ ] Cada função auxiliar acrescenta uma responsabilidade identificável; nenhuma apenas esconde uma função nativa.
- [ ] Os nomes explicam a finalidade e os mapeamentos permitem conferir origem e destino.
- [ ] Regras relacionadas permanecem próximas; as extrações reduzem o esforço de leitura.
- [ ] Comentários explicam decisões e não substituem a clareza do código.
- [ ] As APIs padrão são utilizadas sem acesso direto aos dicionários.
- [ ] Os comportamentos anteriores foram comparados com a alteração e nenhuma regra foi omitida.
- [ ] A validação realizada e suas limitações foram registradas, sem apresentar revisão estática como compilação ou homologação.

A adoção inicial deve revisar os fontes BJ por responsabilidade,
começando pelos auxiliares triviais, nomes opacos e mapeamentos fragmentados.
Mudanças de nomes públicos exigem conferir chamadas, catálogo, menu e
agendamentos. A adequação dos fontes permanece trabalho pendente; esta decisão
atualiza a documentação e os critérios de aceite.

---

## 3. A chave: `codigoErp`

Absorvido de `docs/planos/integracao-codigo-erp.md` em 08/09/2026, **com as
correções que a revisão do código encontrou**.

**O ERP manda o código natural, e é por ele que a API decide criar ou atualizar.**
O valor é **opaco para a plataforma**: quem escolhe o que vai nele é o ERP,
endpoint por endpoint. A API não interpreta, não monta e não valida formato — só
guarda, indexa e compara. Validação é tamanho e não-vazio.

**Referência viaja por código, nunca por uuid.** Chega `produtoCodigo` no estoque
→ a API acha o produto pelo `codigoErp` → pega o uuid → grava. Código não
encontrado é erro no registro, nunca FK nula em silêncio.

**`POST` é upsert em todos os endpoints.** Não existe `409` por duplicidade:
código novo cria, código ativo atualiza com o payload inteiro, código excluído
atualiza **e** limpa o `deletedAt`. Nos três casos a resposta é `201`.

### A tabela — esta é a definição

As partes são unidas por hífen, montadas no próprio mapeador. **A filial sai da
coluna `*_FILIAL` do registro**, sem `AllTrim()`; `FWxFilial()` aparece só no
filtro SQL e ao montar referência para outra tabela. POST e DELETE montam
exatamente a mesma string.

**Cadastros:**

| Endpoint | Origem | `codigoErp` | Situação |
|---|---|---|---|
| regras-desconto | SZ0 | `Z0_FILIAL`-`Z0_CODIGO` | ✅ |
| categorias (raiz) | **SZ1** | `Z1_FILIAL`-`Z1_TIPO` | ✅ |
| categorias (filha) | SBM | `BM_FILIAL`-`BM_GRUPO`, pai `filial`-`BM_YTIPO` | ✅ |
| condicoes-pagamento | SE4 | `E4_FILIAL`-`E4_CODIGO` | ✅ |
| armazens | NNR | `NNR_FILIAL`-`NNR_CODIGO` | ✅ |
| produtos | SB1 | `B1_FILIAL`-`B1_COD` | ✅ |
| vendedores | SA3 | `A3_FILIAL`-`A3_COD` | ✅ |
| clientes | SA1 | `A1_FILIAL`-`A1_COD`-`A1_LOJA` | ✅ |
| **fornecedores** | SA2 | `A2_FILIAL`-`A2_COD`-`A2_LOJA` | ✅ 08/09 |
| tabelas-preco | DA0 | `DA0_FILIAL`-`DA0_CODTAB` | ✅ |
| tabelas-preco → itens | DA1 | `DA1_FILIAL`-`DA1_CODTAB`-`DA1_CODPRO` | ✅ |
| **estoque** | SB2 | `B2_FILIAL`-`B2_COD`-`B2_LOCAL` | ✅ |

> **Correção de 08/09/2026 — o estoque tem `codigoErp` próprio.** O documento
> absorvido dizia em dois lugares que o estoque era "a única entidade sem
> `codigoErp`", com a chave "na URL" como `{produtoCodigo}/{armazemCodigo}`.
> **Está errado**, e contradizia a própria tabela dele. O contrato
> (`integracaoEstoqueCreateSchema`) tem `codigoErp`, e a rota é
> `@Patch(':codigo')` — um segmento só. Foi essa frase que produziu o bug do
> exemplo errado no `endpoints.md` — TASK-050.

**Transacionais:**

| Endpoint | Origem | `codigoErp` | Exemplo | Situação |
|---|---|---|---|---|
| notas-saida | SF2 | `F2_FILIAL`-`F2_DOC`-`F2_SERIE`-`F2_TIPO`-`F2_ESPECIE` | `01-000012345-1-N-SPED` | ✅ |
| notas-saida → itens | SD2 | `D2_FILIAL`-`D2_DOC`-`D2_SERIE`-`D2_ITEM` | `01-000012345-1-0001` | ✅ |
| **notas-entrada** | SF1 | `F1_FILIAL`-`F1_DOC`-`F1_SERIE`-`F1_FORNECE`-`F1_LOJA`-`F1_FORMUL` | `01-000004212-1-000042-01-N` | ✅ 08/09 |
| **notas-entrada → itens** | SD1 | `D1_FILIAL`-`D1_DOC`-`D1_SERIE`-`D1_FORNECE`-`D1_LOJA`-`D1_ITEM` | `01-000004212-1-000042-01-0001` | ✅ 08/09 |
| titulos-receber | SE1 | `E1_FILIAL`-`E1_PREFIXO`-`E1_NUM`-`E1_PARCELA`-`E1_TIPO` | `01-NF-000012345-A-NF` | ✅ |
| orcamentos | SCJ | `CJ_FILIAL`-`CJ_NUM` | `01-000123` | ✅ |
| orcamentos → itens | SCK | `CK_FILIAL`-`CK_NUM`-`CK_ITEM` | `01-000123-01` | ✅ |
| objetivos | — | sem origem no ERP; entidade inativa no catálogo | | ⏸️ |

**Por que a nota leva filial, tipo e espécie.** A filial entra porque a chave de
API é por **empresa**, e uma empresa tem várias filiais: duas filiais emitindo a
nota `000012345` série `1` cairiam no mesmo registro, e a segunda sobrescreveria
a primeira sem erro nenhum. Tipo e espécie separam documentos que compartilham
numeração (normal, devolução, beneficiamento). A chave da NF-e foi descartada: só
existe depois da autorização, e nota em digitação precisa subir antes disso.

**A chave da SF1 não leva o `F1_TIPO`** (decidido em 08/09/2026). Consequência
conhecida: se um dia existir uma compra `'N'` e uma devolução `'D'` com o mesmo
`F1_DOC`+`F1_SERIE`+`F1_FORNECE`+`F1_LOJA`+`F1_FORMUL`, as duas montariam a mesma
string e a segunda sobrescreveria a primeira. Na prática o participante difere.

**A SF1 tem dois participantes possíveis.** `F1_TIPO = 'N'` é compra e o mapeador
manda `fornecedorCodigo` (SA2); `F1_TIPO = 'D'` é devolução de venda e manda
`clienteCodigo` (SA1) — mesmo o campo de origem sendo `F1_FORNECE`+`F1_LOJA` nos
dois casos. É o `clienteCodigo` que faz a devolução aparecer na aba *Devoluções*
da Posição de Cliente.

**A devolução não entra nas apurações.** Objetivos, Consultas e Dashboard
continuam contando a devolução pelo `vlrDevolucao` da **nota de saída**. As duas
fontes somadas contariam a mesma devolução duas vezes.

**Pedido de Venda não tem endpoint.** Não existe model, tabela nem rota para SC5
na plataforma. Enviar pedido exigiria criar a entidade do lado de lá — está em
**Fora deste plano**.

### O prefixo de filial vale nos dois sentidos

**Toda referência que sai daqui volta prefixada.** A plataforma devolve
`clienteCodigo: "01-000123-01"` e `produtoCodigo: "01-11400443"` porque foi isso
que o ERP mandou. Quem recebe **tem de desmontar a string** antes de posicionar a
SA1 ou a SB1.

Mesma regra para o reenvio dirigido pelo monitor: a chave guardada em `ZZ_CHVORI`
é o `codigoErp` prefixado, e o mapeador que a recebe filtra por `B1_COD`, que não
tem prefixo nenhum.

---

## 4. O que falta

| Tarefa | O quê |
|---|---|
| TASK-058 | ⛔ **Cadastrar a SZY** (SX2, SX3 e SIX) pelo Configurador, conforme a **seção 5**: 11 campos, dois índices, `ZY_STATUS` com combo. Sem ela o `RecLock("SZY", .T.)` de `U_BJVARRE` falha na primeira linha e nenhuma coleta acontece |
| TASK-059 | ⛔ **Acrescentar à SZZ** o campo `ZZ_CODIGO` (C(9), amarração com o lote da SZY) e os dois índices: `ZZ_FILIAL+ZZ_CODIGO+ZZ_SEQUEN` (chave única) e `ZZ_FILIAL+ZZ_CODIGO+ZZ_SEQUEN+ZZ_STATUS`. **Sem o primeiro nada roda** — é por ele que o envio percorre a fila e que a gravação do resultado acha a mensagem |
| TASK-060 | ⛔ **Entrada de cliente novo.** O escopo da entrada é orçamento aprovado, cliente novo e alteração de cliente aprovada. O `BJPLA004` só sabe *alterar* cliente que já existe na SA1 (`CRMA980`); a **inclusão** não está escrita. Depende do contrato da rota, que a plataforma não expõe — mesma dependência de TASK-051 (**DEP-005**) |
| TASK-049 | Segunda passada de XML por `?semXml=true`: nota enviada antes da autorização na SEFAZ não tem XML no TSS naquele instante, e é essa varredura que a alcança depois. Hoje o XML é reenviado a cada mudança da SF2 |
| TASK-051 | **Decidir com a plataforma** o retorno de cliente (novo e alteração) — **spec de desenvolvimento no apêndice C**. A rota `/integracao/clientes/alteracoes` que o `BJPLA004` chama **não existe** — a fila de aprovação é interna. Ou a API expõe a rota, ou TASK-023 sai do escopo e o código é removido |
| TASK-033 | Compilar os quatro fontes (`BJPLA002` a `BJPLA005`) |
| TASK-034 | Conferir os payloads contra `testes-swagger.json`, campo a campo |
| TASK-035 | Cadastrar os agendamentos apontando para `U_BJVARRE` (coleta), `U_BJDRENA` (envio), `U_BJRETORNO` (retorno) e `U_BJEXPURG` (expurgo) — **não existe mais o `BJPLA001`**, removido em 17/09/2026. Cadastrar `MV_BJAPI01` a `MV_BJAPI12` (os oito novos saíram das constantes do fonte em 17/09/2026 — ver a seção daquele dia), cadastrar o menu do monitor e os quatro agendamentos. **Conferir o `MV_BJAPI04`**: o nome já existiu no desenho antigo guardando data, e agora é numérico |
| TASK-036 | Primeira carga, entidade por entidade, na ordem do catálogo |
| TASK-050 | Corrigir o estoque em `docs/integração/endpoints.md`: a "Visão geral" e as "Receitas rápidas" ainda mostram `/estoque/{produtoCodigo}/{armazemCodigo}`; a rota real é `/estoque/{codigoErp}` |
| TASK-039 | Conferir se há objeto `BJIN*` no RPO e removê-lo. Nunca foram compilados segundo **RISK-003** — esta tarefa confirma ou desmente |

---

## 5. Estrutura da SZY (mestre) e da SZZ (detalhe)

**Decisão de 11/09/2026, implementada no mesmo dia.** Primeira versão: a marca
d'água saiu de dentro da SZZ (linha especial `ZZ_CHVORI = "*CONTROLE*"` na
diretriz original, `"*MARCA*"` na descrição de campos — as duas grafias
conviviam no plano, e nenhuma delas existe mais) para uma tabela própria,
**SZY**, com uma linha fixa por entidade. **Revisão no mesmo dia:** uma linha
fixa por entidade não é mestre/detalhe de verdade — é só uma linha de
controle deslocada de mesa. O desenho final é **um registro de SZY por
processamento** (cada chamada de `BJVarreEnt` para uma entidade, e cada
alteração manual de marca pelo monitor): início, fim, status e contadores de
cada execução ficam registrados, e a SZZ gerada naquela execução carrega o
vínculo em `ZZ_CODIGO`. É mestre/detalhe no sentido pleno — como cabeçalho e
item de um documento Protheus (SF2/SD2): cada execução é uma instância nova
do mestre, com seu próprio detalhe.

Cadastro e índices da SZY são responsabilidade do Configurador, como já vale
para a SZZ — nenhuma criação por SX2/SX3/SIX direto no código (CON-003 da
seção de restrições, mesma regra que tirou o acesso direto ao dicionário do
`BJPLA006`).

### 5.1 SZY — mestre (um registro por chamada de `BJVARRE`/`BJRETORNO`)

Um lote cobre a chamada inteira,
não uma entidade: `BJVARRE` varre o catálogo ativo inteiro (ou a entidade
explícita, quando chamado com `xEntid` preenchido) sob um único lote, e cada
entidade dentro do laço só enfileira mensagens em SZZ sob esse mesmo
`ZY_CODIGO`. A SZY **não tem campo de entidade** — quem identifica cada
mensagem é o `ZZ_ENTID`, no detalhe.

| Campo | Tipo | Conteúdo |
|---|---|---|
| `ZY_FILIAL` | C(2) | Filial |
| `ZY_CODIGO` | C(20) | Código do lote — `MAX(ZY_CODIGO)+1` em SQL. Mesmo nome e mesmo valor que `ZZ_CODIGO`, na SZZ |
| `ZY_DTINI` / `ZY_HRINI` | D / C(8) | Quando o lote começou a trabalhar. Com o fim, mede a duração — **não é a janela de coleta**, que é a `ZY_MARCA` |
| `ZY_DTFIM` / `ZY_HRFIM` | D / C(8) | Quando o lote terminou de coletar. Vazio enquanto em andamento |
| `ZY_STATUS` | C(1) | **Diz qual lote ainda precisa ser processado.** `1` coletado, aguardando envio · `2` processado (coletado **e** enviado) · `3` erro. O envio percorre os `1` e os `3`; o `2` está pronto e não volta. Vale para o lote inteiro — uma entidade com erro marca o lote todo como `3` |
| `ZY_MARCA` | C(19) | **A marca do lote**: o corte até onde ele coletou, UTC `AAAA-MM-DD HH:MM:SS`, e a referência para o início do próximo. Gravada quando a coleta varreu o catálogo inteiro sem erro e não foi pontual. O envio não entra nessa conta — mensagem que falhou fica pendente no próprio lote e é reenviada de lá |
| `ZY_QTDLIDO` | N(6) | Registros que os mapeadores devolveram, somados de todas as entidades do lote |
| `ZY_QTDENV` | N(6) | Registros enfileirados com sucesso, somados de todas as entidades do lote |
| `ZY_QTDERR` | N(6) | Erros de enfileiramento, somados de todas as entidades do lote |

Índice: `ZY_FILIAL + ZY_CODIGO`, chave única.

**Consequência aceita:** como o `ZY_STATUS`/`ZY_MARCA` valem para o lote
inteiro, um erro numa única entidade (ex.: produtos) segura o avanço da
marca do lote inteiro, inclusive de entidades que não tiveram erro nenhum
(ex.: clientes) — diferente do desenho anterior (uma linha de SZY por
entidade), em que o erro de uma não afetava as outras. Aceito como troca
pelo mestre/detalhe real: a próxima varredura de uma entidade que ficou sem
marca nova simplesmente alarga a janela de busca até achar o último lote em
que ela teve mensagem — sem duplicidade, só uma consulta de origem um pouco
mais ampla enquanto isso não se resolve.

### 5.2 SZZ — detalhe (uma linha por mensagem)

| Campo | Tipo | Conteúdo |
|---|---|---|
| `ZZ_FILIAL` | C(2) | Filial |
| `ZZ_CODIGO` | C(20) | `ZY_CODIGO` do lote (SZY) que gerou esta mensagem. Mesmo nome e mesmo valor do lote pai — uma chamada de `BJVARRE`/`BJRETORNO` |
| `ZZ_SEQUEN` | C(9) | Sequência — a ordem de chegada, e a ordem de consumo |
| `ZZ_TIPO` | C(1) | `S` saída · `E` entrada |
| `ZZ_ENTID` | C(20) | Entidade do catálogo. 20 cabe o maior id: `orcamentos-pendentes` |
| `ZZ_CHVORI` | C(60) | **Chave de origem.** `codigoErp` na saída, id da plataforma na entrada |
| `ZZ_VERBO` | C(6) | POST · PATCH · DELETE · GET · PUT |
| `ZZ_JSON` | Memo | O payload. Permite reenviar sem varrer a origem de novo |
| `ZZ_STATUS` | C(1) | `1` pendente · `2` executada · `3` erro |
| `ZZ_DTCRIA` | D | Data em que entrou na fila |
| `ZZ_HRCRIA` | C(8) | Hora em que entrou na fila |
| `ZZ_DTEXEC` | D | Data da última execução |
| `ZZ_HREXEC` | C(8) | Hora da última execução |
| `ZZ_HTTP` | N(3) | Código da última resposta |
| `ZZ_RETORN` | Memo | A resposta da API, íntegra — sucesso ou erro |
| `ZZ_CHVDES` | C(60) | **Chave de destino.** O documento gerado do outro lado na entrada; o id da plataforma na saída |

`ZZ_MARCA` sai da SZZ — a marca d'água agora é `ZY_MARCA`, na SZY. Não há mais
linha de controle dentro da fila de mensagens, então o filtro
`ZZ_CHVORI <> '*MARCA*'`/`'*CONTROLE*'` saiu de `BJContaFila`, `BJListaMsg` e
`BJEXPURG` (`BJPLA002.prw`/`BJPLA005.prw`) — ele já estava incoerente entre os
dois fontes (grafias diferentes) antes desta mudança.

**`ZZ_SEQUEN` e `ZY_CODIGO` seguem o mesmo padrão de numeração**: `SELECT
MAX(<campo>) FROM <tabela> WHERE <FILIAL> = ? AND D_E_L_E_T_ = ' '`,
incrementado com `Soma1()` (ver seção "Numeração de Sequência da SZZ por SQL
`MAX(ZZ_SEQUEN)`"). Sem SXE, sem `GetSxeNum` — cada tabela numera sozinha,
dentro do próprio `RecLock`. O bloco se repete em `BJENFILA` (SZZ) e em
`BJVARRE`/`BJRETORNO` (SZY, duas vezes cada: abre e fecha o lote) — mesmo
padrão de repetição curta já usado no projeto (GUD-002), sem wrapper.

### Índices

**SZY**

| Ordem | Chave | Para quê |
|---|---|---|
| 1 | `ZY_FILIAL + ZY_CODIGO` | Chave única, e a ordem de processamento: do lote mais antigo para o mais novo |
| 2 | `ZY_FILIAL + ZY_CODIGO + ZY_STATUS` | Achar os lotes **com erro e os não processados** sem varrer os que já saíram. O status vem no fim: quem o usa é o banco, na consulta que o envio faz |

**SZZ**

| Ordem | Chave | Para quê |
|---|---|---|
| 1 | `ZZ_FILIAL + ZZ_CODIGO + ZZ_SEQUEN` | **Chave única.** O detalhe do mestre: o lote amarra, a sequência ordena. É por ele que o envio percorre a fila e que `U_BJGRAVA` e o monitor chegam numa mensagem |
| 2 | `ZZ_FILIAL + ZZ_CODIGO + ZZ_SEQUEN + ZZ_STATUS` | **Pegar as pendentes e as com erro** de um lote. O status vem depois da sequência, então não entra em `dbSeek`: quem o usa é o banco, nas consultas que filtram status dentro do lote, e a chave cobre todo o filtro |

Três índices foram retirados em 17/09/2026. O `ZZ_STATUS + ZZ_DTCRIA` era o
caminho do drenador antigo, que varria por status; desde que a drenagem passou a
ser por lote ninguém o usava, e o expurgo, último a depender dele, passou a
selecionar os `R_E_C_N_O_` por consulta. O `ZZ_FILIAL + ZZ_SEQUEN` deixou de ser
chave: **a sequência sozinha não identifica uma mensagem neste desenho** — o que
identifica é lote + sequência, e os dois pontos que buscavam só pelo número
(`U_BJGRAVA` e o monitor) passaram a receber o lote de quem os chama. O
`ZZ_FILIAL + ZZ_CHVDES` saiu por não ter leitor nenhum: o campo é gravado e
lido do registro já posicionado, e nada faz `dbSeek` por ele.

## 6. Os dois fluxos

### Saída

1. **Varrer e enfileirar.** Os mapeadores leem a origem e montam o JSON. Em vez
   de enviar, cada registro vira uma mensagem pendente. Terminada a varredura, a
   marca d'água já pode avançar — o que precisa ser enviado está guardado.
2. **Drenar.** Lê as pendentes na ordem da sequência e envia. Cada uma grava seu
   resultado. Falhou, continua pendente e volta no próximo ciclo — sozinha, sem
   arrastar as outras.

A ordem da sequência é também a ordem de carga que a API exige, porque a
varredura enfileira o catálogo em ordem: regra de desconto antes de categoria,
categoria antes de produto, vendedor antes de cliente, produto antes de estoque,
fornecedor antes de nota de entrada.

### Entrada — onde a transação precisa fechar

1. `GET /integracao/orcamentos/pendentes` devolve o orçamento aprovado na
   plataforma.
2. **Consultar a fila local antes de tudo.** Existe mensagem de entrada para esse
   id já executada? Então o pedido já foi gerado, e falta só reenviar o aviso do
   passo 4. Nada é gerado de novo.
3. **`Begin Transaction`** — o `MATA410` grava SC5/SC6 e, na mesma transação, a
   mensagem passa a executada com o número do pedido em `ZZ_CHVDES`. Se a
   marcação falhar, o pedido volta atrás com ela.
4. `PATCH .../pendentes/{id}` com o `codigoErp` gerado.

> **A garantia inteira depende do passo 3.** Se a gravação sair de dentro do
> `Begin Transaction`, a fresta reabre sem nenhum sintoma visível: volta a
> existir o intervalo em que o documento está na SC5 e a plataforma não sabe, e o
> ciclo seguinte gera um segundo.

---

## 7. Dependencies

- **DEP-001**: **SZZ cadastrada no dicionário** (SX2, SX3, SIX, SXE). Bloqueia tudo a partir da Phase 2. Cadastro manual pelo Configurador.
- **DEP-002**: **DBAccess 20.1.1.0 ou superior**, para a coluna `S_T_A_M_P_` mantida por gatilho.
- **DEP-003**: **Chave de API (`itg_...`) por empresa**, obtida em *Administração > Integração*. Uma chave por empresa, logo um agendamento por empresa.
- **DEP-004**: **TSS configurado** (`WSNFeSBRA`), para o envio do XML da NF-e.
- **DEP-005**: **Rota de cliente na API.** A entrada de cliente — nova e alteração — fica inerte até ela existir. TASK-051 decide, TASK-060 implementa.

---

## 8. Files

Em `Portal/BJ/`:

- **FILE-002**: `BJPLA002.prw` — **Funções.** Agendável: `U_BJEXPURG`. Catálogo, cliente HTTP, leitura do `codigoErp`, fila (enfileirar, gravar resultado, memória, expurgo). Todos dependem dele; ele não depende de nenhum.
- **FILE-003**: `BJPLA003.prw` — **Coleta de saída.** Agendável: `U_BJVARRE`. A varredura que lê por `S_T_A_M_P_` e enfileira, e os 16 mapeadores.
- **FILE-004**: `BJPLA004.prw` — **Envio e retorno.** Agendáveis: `U_BJDRENA` e `U_BJRETORNO`. Drenagem lote a lote (`BJDRENA`), envio em bloco por `PUT` (`BJLOTE`) e a gravação do que chega: orçamento → SCJ, alteração de cliente → SA1.
- **FILE-005**: `BJPLA005.prw` — **Monitor.** A única com interface: browse dos lotes, leitura de uma mensagem, reenvio, envio em bloco e expurgo sob demanda.
- ~~**FILE-006**: `BJPLA006.prw`~~ — **Removido em 08/09/2026.** Preparava a coluna `S_T_A_M_P_`; todas as tabelas já têm a coluna. SZZ e parâmetros continuam conferidos pelo Configurador.

Nada fora de `Portal/BJ/` é tocado: a integração não altera fonte padrão nem
Ponto de Entrada.

## 9. Testing

- **TEST-001**: Conferir cada payload dos mapeadores contra `testes-swagger.json`, campo a campo.
- **TEST-002**: Enfileirar uma entidade sem drenar, e confirmar que a marca d'água avançou e nada chegou à plataforma.
- **TEST-003**: Drenar com a API indisponível, e confirmar que as mensagens continuam com status `3` e voltam no ciclo seguinte, e que a varredura seguinte não as duplica.
- **TEST-004**: **Duplicidade.** Interromper o processo entre o passo 3 e o 4 da entrada. Na execução seguinte, confirmar que nenhum documento novo é gerado e que só o `PATCH` é reenviado.
- **TEST-005**: **Transação.** Forçar falha na gravação da mensagem dentro do `Begin Transaction` e confirmar que o orçamento não fica na SCJ.
- **TEST-006**: Excluir um registro na origem e confirmar que a mensagem sai com `DELETE`, e que 404 é tratado como resolvido.
- **TEST-007**: Rodar o expurgo e confirmar que pendentes e com erro nunca são apagadas, independente da idade.
- **TEST-008**: Categorias — confirmar que a SZ1 sobe antes da SBM e que o produto referencia `B1_TPRCG` e `B1_GRUPO`, ambos já existentes na plataforma.
- **TEST-009**: Compilar os seis fontes sem erro e sem aviso novo.
- **TEST-010**: Revisar cada função contra PAT-002: se apagar a função e colar o corpo em cada chamada deixasse o código igual ou mais claro, a função sobra e tem de sair.
- **TEST-011**: **Ida e volta da chave.** Criar um orçamento na plataforma para um cliente e um produto que subiram daqui, rodar o retorno e confirmar que a SCJ recebeu o cliente, o produto, o vendedor e a condição certos — não a string prefixada.
- **TEST-012**: **Reenvio dirigido.** Pelo monitor, reenviar uma chave de cada entidade e confirmar que o mapeador achou o registro. Hoje nenhum acha.
- **TEST-013**: **Lote.** Mandar 1.000 registros com um inválido no meio e confirmar que os 999 entraram, que o inválido volta em `erros` com o `indice` certo, e que a mensagem correspondente na fila ficou com erro e as outras executadas.
- **TEST-014**: **Devolução.** Uma devolução de venda `'D'` aparece na aba *Devoluções* da Posição de Cliente, e o valor não é contado duas vezes nas apurações.

---

## 10. Risks & Assumptions

- **RISK-001**: **A transação do ExecAuto.** Um refactor que tire a gravação da mensagem de dentro do `Begin Transaction` reabre a duplicidade sem sintoma visível — nada quebra, nada avisa, e o problema só aparece no dia em que a rede cair na hora errada. Mitigação: TEST-005 e comentário no ponto.
- **RISK-002**: **Tamanho do `BJPLA003`.** Passa de 3.000 linhas. Quando ficar difícil de navegar, a saída é separar os mapeadores de cadastro dos transacionais num fonte a mais, com o próximo número da sequência.
- **RISK-003**: **Escrita a partir de código nunca executado.** Os `BJIN*` nunca foram compilados, rodados nem colocados em produção. O que foi aproveitado deles é desenho, não código validado. Em compensação, **não há base instalada para migrar**: nem histórico de envio, nem marca d'água em uso, nem dado na plataforma vindo desta integração. A estrutura nova começa do zero. TASK-039 confirma o lado do RPO.
- **RISK-004**: **Crescimento da SZZ.** Uma linha por mensagem cresce com o número de alterações, não com o tamanho da base. Sem o expurgo rodando, cresce indefinidamente.
- **RISK-005**: **Duas integrações no mesmo RPO.** Enquanto existir objeto `BJIN*` no RPO, basta alguém agendar um deles para os dois saírem pelo mesmo IP, dividindo o balde de 60 req/min e disputando as mesmas chaves. Mitigação: TASK-037.
- **RISK-007**: **Documentação divergindo de novo.** Já produziu bug de código antes. Mitigação: este arquivo é o único plano, e a seção 3 é a única definição das chaves. Contradição entre este arquivo e `docs/integração/` é bug de documentação e vira tarefa, não é resolvida na conversa.
- **ASSUMPTION-001**: O campo de filial desta base tem 2 posições. Os fontes fixam `"01"`.
- **ASSUMPTION-002**: `SBM.BM_YTIPO` referencia `SZ1.Z1_TIPO`, e `BM_GRUPO` é composto pelo tipo nas duas primeiras posições mais a sequência. Confirmado pelo gatilho `RESTG02.prw:25-32` e pelas queries de `BJFATX02.prw`.
- **ASSUMPTION-003**: `POST` é upsert em todas as rotas, então reenviar a mesma mensagem de saída é inofensivo. É o que permite a drenagem retentar sem controle adicional. Confirmado no smoke test de 03/09.
- **ASSUMPTION-004**: ~~`SA2.A2_TIPO` guarda a natureza do fornecedor.~~ **Resolvida em 08/09/2026.** O campo existe (`SA2 / 04 / A2_TIPO / C(1) / "Tipo"`) e o domínio real desta base foi contado: `"J"` em 1.487 fornecedores, `"F"` em 12, e **2 em branco**. `U_BJMAPFOR` manda `fisica` no `"F"` e `juridica` no resto — com uma exceção: **branco não vira `juridica` por omissão**. O contrato declara `tipoPessoa` como enum com `default("juridica")` e **não aceita nulo**, então a escolha é definitiva do lado da plataforma, e um CPF rotulado como CNPJ erra a formatação e a validação na tela. Nos 2 registros em branco quem decide é o documento: `A2_CGC` com 11 dígitos é CPF, o resto é CNPJ.
- **ASSUMPTION-005**: ~~O ICMS-ST está em `F1_VALSOLI` no cabeçalho.~~ **Resolvida em 08/09/2026 pelo SX3.** O item tem `D1_ICMSRET N(14,2) "ICMS Solid."` — confirmado. O cabeçalho **não tem** `F1_VALSOLI` neste dicionário (ausente do SX3 e sem uso em nenhum fonte da base fora de `Portal/BJ/`). Por isso `U_BJMAPNFE` **soma o `D1_ICMSRET` dos itens** para o `vlrIcmsSt` do cabeçalho, e usa o campo de cabeçalho só se ele existir. Mandar zero tendo o dado na SD1 seria erro silencioso num campo fiscal.
- **ASSUMPTION-006**: ~~`A2_CONTATO`, `A2_CEL` e `A2_OBSERV` podem não existir nesta base.~~ **Resolvida em 08/09/2026, campo a campo:**
  - `A2_INSCRM C(18) "Ins. Municip"` — **existe**. Vai sem guarda.
  - `A2_CONTATO` — **existe**. Vai sem guarda.
  - `A2_DDD` + `A2_TEL` — **existem**, e são a origem do `telefone`.
  - `A2_TIPO C(1)` — **existe**. Vai sem guarda.
  - `A2_OBSERV` — **não existe**. O campo foi retirado do mapeador em vez de ficar como guarda morta; `observacao` sobe vazio, de propósito, e está escrito no bloco de doc do `U_BJMAPFOR`.
  - `A2_CEL` — **único ainda não conferido no SX3**. Segue guardado por `FieldPos()`: se não existir, `celular` não sobe, e o `telefone` não depende dele.

---

## 11. Decisões em aberto

1. ~~**Mensagem pendente repetida.**~~ **Decidido em 17/09/2026:** cada coleta grava mensagem nova. As janelas não se sobrepõem — a das 10:00 varre até 10:00, a das 11:00 varre de 10:00 a 11:00 —, então a mesma chave só reaparece se mudou de novo, e aí é estado novo em momento novo. `U_BJENFILA` não reaproveita nem sobrescreve linha.
2. **Retenção.** Por quanto tempo a mensagem executada fica antes do expurgo. O código usa 90 dias como padrão. É o único número que dimensiona a SZZ, então precisa sair antes da primeira carga.
3. **Cliente vindo da plataforma.** O escopo da entrada é **orçamento aprovado, cliente novo e alteração de cliente aprovada**. A inclusão de cliente novo não existe no código (TASK-060) e a rota não existe na API (TASK-051).

---

## 12. Fora deste plano

| Item | Situação |
|---|---|
| Objetivos de venda | Sem origem definida no ERP. A entidade nasce inativa no catálogo, e o mapeador é um esqueleto |
| Pedido de Venda (SC5/SC6) | Não há model, tabela nem rota na plataforma. Exigiria criar a entidade do lado de lá |
| Purge físico | Linha removida do banco não aparece em varredura nenhuma. Só por reenvio dirigido pelo monitor |
| `regraDescontoCodigo` nos itens | Sem campo confirmado na SB1, DA1, SD2 ou SCK deste dicionário. Vai `null` |
| Consultas gerenciais de compra | Decisão da plataforma em 08/09: nasceriam sobre dados que ainda não existem |

---

## 13. Divergências conhecidas entre os documentos da API

| Ponto | O que diverge | O que o código faz |
|---|---|---|
| `POST /notas-saida/{codigoErp}/xml` | `endpoints.md` documenta corpo JSON com `xml` **ou** `xmlBase64`, com curl executável; `testes-swagger.json` anota `multipart/form-data` | Segue o `endpoints.md` e manda `xmlBase64`. Se o primeiro envio voltar **415**, é este o motivo — e aí o caminho é multipart, que o `FWRest` não monta sozinho |
| Rota do estoque | `endpoints.md` mostra `/estoque/{produtoCodigo}/{armazemCodigo}` na "Visão geral" e nas "Receitas rápidas"; a seção de Estoque e o controller usam `/estoque/{codigoErp}` | Envia certo, na rota de um segmento. O reenvio dirigido lia errado até 17/09/2026 — TASK-044. Documentação corrigida em TASK-050 |
| `dataRetorno` no orçamento | Não citado no `endpoints.md`, aparece no payload de teste | Não é enviado. Não há campo confirmado na SCJ que o alimente |

---

## Apêndice C — TASK-051: retorno de alteração de cliente

Spec de desenvolvimento, escrita em 08/09/2026. **O trabalho é do lado da
plataforma** (`C:\VPS\rcg`); o lado do ERP já está pronto e inerte, esperando a
rota existir.

### O problema em uma frase

O cadastro comercial do cliente é editado nos dois lados — pela equipe interna na
tela e pelo ERP na integração —, mas só o ERP → plataforma tem caminho. O que é
alterado e aprovado na plataforma **nunca volta para a SA1**, e os dois cadastros
divergem em silêncio.

### O que já existe

**Na plataforma**, a governança inteira, decidida em 14/08/2026: nenhuma origem
altera cliente direto. Toda mudança vira uma solicitação com o "de → para", e só
depois de aprovada por quem tem `clientes.aprovar` é aplicada.

| Peça | Onde |
|---|---|
| Model `ClienteAlteracao` | `apps/api/prisma/schema.prisma` |
| Contrato (diff, origem, status) | `packages/contracts/src/cliente-alteracao.ts` |
| Fila interna (JWT + permissão) | `apps/api/src/modules/clientes/cliente-alteracoes.controller.ts` — `GET /clientes-alteracoes`, `POST /{id}/aprovar`, `POST /{id}/recusar` |

O campo `alteracoes` é um diff `Json`: `{ "telefone": { "de": null, "para": "6733..." } }`.
`origem` é `manual` · `enriquecimento` · `integracao` · `agente`.
`status` é `pendente` · `aprovada` · `rejeitada`.

**No ERP**, `U_BJRETORNO` (`BJPLA004`) já lê a rota, aplica na SA1 pelo de-para
de 22 campos e confirma na plataforma. Hoje toma `404` e registra no log sem
quebrar o ciclo.

### O que falta — três peças

**1. Uma coluna de controle no `ClienteAlteracao`**

```prisma
integradoEm DateTime?   // quando o ERP confirmou ter aplicado na SA1
@@index([empresaId, status, integradoEm])
```

Sem ela não há como saber o que o ERP já consumiu, e toda execução do
agendamento reprocessaria as mesmas alterações. É o mesmo papel que o
`codigoErp: null` cumpre na fila de orçamentos pendentes.

**2. Dois endpoints no módulo de integração** (`x-api-key`, fora do `JwtAuthGuard`)

```
GET   /integracao/clientes/alteracoes
PATCH /integracao/clientes/alteracoes/{id}/aplicada
```

O `GET` lista, paginado como todo `GET` da integração (`page`, `pageSize`,
máx. 100), aplicando **três filtros que não são opcionais**:

- `status = 'aprovada'` — pendente e rejeitada nunca saem;
- `integradoEm IS NULL` — o que o ERP ainda não aplicou;
- **`origem <> 'integracao'`** — sem isso o retorno vira laço: o ERP manda um
  `PATCH`, a plataforma enfileira, alguém aprova, e a plataforma devolveria ao
  ERP a alteração que o próprio ERP originou.

Ordem por `analisadoEm` ascendente: as alterações são aplicadas na ordem em que
foram aprovadas.

O `PATCH` grava `integradoEm = now()`. `404` se o id não existir; `409` se já
tiver `integradoEm` ou se não estiver aprovada.

**3. O formato do payload — achatado, não o diff**

```jsonc
{
  "data": [
    {
      "id": "8b9c0d1e-2f3a-4b4c-5d6e-7f8091a2b3c4",
      "clienteCodigo": "01-000123-01",
      "origem": "manual",
      "aprovadaEm": "2026-09-08T14:22:00.000Z",
      // só os campos que mudaram, já com o valor final
      "telefone": "6733210000",
      "vendedorCodigo": "01-000234"
    }
  ],
  "total": 1, "page": 1, "pageSize": 100, "totalPages": 1
}
```

**Por que achatado e não `{ de, para }`.** O diff é o formato interno da
governança da plataforma, e o ERP não tem o que fazer com o `de` — ele grava o
valor final na SA1. Todo o resto do contrato de integração trafega valor achatado,
e é assim que o `BJCamposAlt` já lê (`oAlt:GetJsonObject("razaoSocial")`).
Mandar o diff obrigaria o ERP a conhecer um segundo formato só nesta rota.

**As referências saem prefixadas**, como em todo o contrato: `vendedorCodigo`
vem `01-000234`, `tabelaPrecoCodigo` vem `01-001`. Quem desmonta é o ERP: o
`BJCamposAlt` trata esses campos como tipo `R` e corta o primeiro segmento —
ver a seção 3.

### Os 22 campos que o ERP sabe aplicar

A lista branca do `BJCamposAlt` é o contrato real desta rota. Campo fora dela é
ignorado com aviso no log, então a plataforma pode mandar tudo sem quebrar nada —
mas o que não estiver aqui não chega à SA1:

| Contrato | SA1 | | Contrato | SA1 |
|---|---|---|---|---|
| `razaoSocial` | `A1_NOME` | | `contato` | `A1_CONTATO` |
| `nomeFantasia` | `A1_NREDUZ` | | `email` | `A1_EMAIL` |
| `cnpjCpf` | `A1_CGC` | | `telefone` | `A1_TEL` |
| `inscricaoEstadual` | `A1_INSCR` | | `celular` | `A1_CELULAR` |
| `inscricaoMunicipal` | `A1_INSCRM` | | `vendedorCodigo` | `A1_VEND` |
| `endereco` | `A1_END` | | `tabelaPrecoCodigo` | `A1_TABELA` |
| `complemento` | `A1_COMPLEM` | | `condicaoPagamentoCodigo` | `A1_COND` |
| `bairro` | `A1_BAIRRO` | | `limiteCredito` | `A1_LC` |
| `municipio` | `A1_MUN` | | `vencimentoLimite` | `A1_VENCLC` |
| `uf` | `A1_EST` | | `latitude` | `A1_XLAT` |
| `cep` | `A1_CEP` | | `longitude` | `A1_XLNG` |

Ficam de fora de propósito: chave, filial, bloqueio e campos calculados —
alterar `A1_COD` por integração seria criar outro cliente.

### Idempotência: por que a ordem PATCH-depois-de-gravar funciona

O ERP grava a SA1 e marca a mensagem da fila como executada **na mesma
transação** (CON-001), e só então chama o `PATCH`. Se o `PATCH` falhar — rede,
timeout —, o ciclo seguinte reencontra a alteração (o `integradoEm` continua
nulo), o `U_BJACHOU` responde que aquele id já foi aplicado, e a rotina **só
reenvia o `PATCH`**, sem tocar na SA1 de novo. Já implementado em `BJTrataAlt`.

Por isso o `PATCH` precisa ser idempotente no caso feliz e devolver `409` — e não
`500` — quando a alteração já estiver integrada.

### Esforço e ordem

Uma migration aditiva, um controller, um método de service e o schema no
contrato. Pequeno, e sem impacto no que já roda: a fila interna e as telas não
mudam.

Nada disso bloqueia a Phase 6 nem a primeira carga — o `U_BJRETORNO` segue
tratando o `404` e registrando no log.

### Se a decisão for não fazer

TASK-023 sai do escopo, e o código de alteração de cliente é removido do
`BJPLA004` (`BJLeAltCli`, `BJTrataAlt`, `BJCamposAlt`, `BJGravSA1`, `BJConfAlt` —
cerca de 300 linhas) em vez de ficar como caminho morto que registra `404` para
sempre.

A consequência precisa ser consciente: **o cadastro editado na tela nunca volta
para o ERP.** Um telefone corrigido pela equipe interna vale até a próxima
varredura da SA1, que sobrescreve a correção com o valor antigo do Protheus — e
ninguém é avisado.

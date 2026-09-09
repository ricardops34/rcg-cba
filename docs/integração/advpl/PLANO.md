---
goal: Plano único da integração ERP Protheus ↔ Plataforma BJ — os dois lados, do que já foi entregue ao que falta
version: 4.0
date_created: 2026-09-01
last_updated: 2026-09-08
owner: Ricardo P Sotomayor
status: 'In progress'
tags: [architecture, feature, integracao, protheus, advpl, api]
---

# Integração ERP ↔ Plataforma BJ — plano único

## Remoção dos acessos diretos ao dicionário — 08/09/2026

Por determinação do projeto, os fontes AdvPL da integração não devem consultar
nem alterar diretamente os dicionários, inclusive SIX, SX2, SX3, SXE e SX6.
Mesmo uma consulta de existência por `dbSelectArea`, `dbSeek` ou `SX*->campo`
viola esse padrão: expõe a estrutura interna do dicionário e contorna as APIs
do framework. A remoção atende às regras locais CA2003 (SX2), CA2013 (SXE)
e CA2010 (SX6). Não foram encontrados acessos diretos a SIX ou SX3 nessa remoção.

| Fonte | Remoção | Motivo |
|---|---|---|
| `Remover/BJIN003.prw` | `BJI003V` | Consultava diretamente SX6 para verificar a existência de parâmetros |
| `Remover/BJIN999.prw` | `BJI999P` e sua chamada | Dependiam de `BJI003V` para listar parâmetros faltantes |
| `Remover/BJIN999.prw` | `BJParams` e `BJMostraMV` | Ficaram sem uso após a retirada da conferência |
| `BJPLA006.prw` | `BJConfSZZ` e sua chamada | Consultava SX2; a conferência de campos e índices foi transferida para o Configurador |
| `BJPLA006.prw` | `BJTemSXE` | Consultava diretamente o cadastro de numeração em SXE |
| `BJPLA006.prw` | `BJConfParam` e sua chamada | Consultava diretamente SX6 |
| `BJPLA006.prw` | Consulta a SX2 dentro de `BJCriaStamp` | Verificava a existência dos aliases por acesso direto ao dicionário |

**Responsabilidade de implantação:** cadastrar e conferir a SZZ, seus campos,
índices, numeração e os parâmetros no Configurador antes de executar a integração.
`BJPLA006` prepara as colunas `S_T_A_M_P_`; seu retorno não certifica a
estrutura da SZZ nem a existência dos parâmetros. A verificação automática
desses cadastros foi removida, sem substituição por SQL direto.

**Comportamentos preservados:** leitura e numeração por APIs do framework
(`GetMV`, `SuperGetMV`, `TamSX3`, `GetSxeNum` e correlatas), fila SZZ e
preparação do `S_T_A_M_P_` nas tabelas de negócio. No legado, `BJI003P`
passou a verificar `MV_BJAPI04` por `GetMV`, mantendo a gravação por `PutMV`.
Essa manutenção não reativa os fontes aposentados de `Remover/`.

A verificação estática não encontrou referências restantes às rotinas removidas
nem acessos diretos a SIX/SX* nos fontes de `Portal/BJ`. Não houve compilação
nem remoção de objetos do RPO; a limpeza do legado no RPO continua na TASK-039.

## Diretrizes Arquiteturais e Decisões de Design — 08/09/2026

### 1. Proibição Estrita de Funções Wrapper (AdvPL Idiomático e Direto)
Por diretriz expressa de arquitetura e legibilidade, **é terminantemente proibido criar funções wrappers que recriem, encapsulem ou mascarem operações nativas e padrões do AdvPL**. O código não deve obrigar nenhum desenvolvedor a reaprender operações básicas da linguagem.
* **Arquivos e semáforos de processo:** `BJTRAVA`, `BJLIBERA` e `BJArqTsk` foram eliminadas. Criação, existência e remoção de arquivos (`File()`, `MemoWrite()`, `FErase()`, `MakeDir()`) são feitas diretamente nos fontes de origem (`BJPLA001.prw`, `BJPLA003.prw`, `BJPLA004.prw`).
* **Manipulação de strings:** `BJSEMFIL` foi eliminada. Operações de extração e corte de chaves usam diretamente `SubStr()`, `At()` e `StrTokArr()`.
* **Condicionais e verbos:** `BJVerbo` foi eliminada. A decisão do verbo HTTP (`POST` ou `DELETE`) é feita explicitamente nos loops de mapeamento com `If (cAlias)->DELETADO == "*"; cVerbo := "DELETE"; Else; cVerbo := "POST"; EndIf`.

### 2. A Fila SZZ e o Controle de Data/Hora de Corte por Entidade
A tabela `SZZ` é a fila oficial de auditoria e transporte da integração, cumprindo dois papéis essenciais de forma transparente:
* **Transporte de Mensagens Reais de Negócio:**
  * `ZZ_TIPO = "S"`: registros do ERP a enviar para a plataforma (clientes, produtos, títulos, etc.).
  * `ZZ_TIPO = "E"`: registros recebidos da plataforma para inclusão no ERP (orçamentos/pedidos).
  * Status explícitos: `1 = Pendente`, `2 = Concluída/Sucesso`, `3 = Erro`.
* **Controle Independente da Última Coleta por Entidade (`*CONTROLE*`):**
  * Cada entidade possui seu próprio horário de corte independente (ex: fornecedores `SA2` no horário X e produtos `SB1` no horário Y). Se houver erro em uma entidade, ela não trava o avanço das demais.
  * O registro de controle utiliza `ZZ_CHVORI = "*CONTROLE*"` e armazena o timestamp em `ZZ_MARCA`.
  * As queries da tela do monitor (`BJContaFila` e `BJListaMsg`) e o expurgo (`BJEXPURG`) preservam e filtram essa linha com `ZZ_CHVORI <> '*CONTROLE*'`.

### 3. Eliminação de Wrappers de Marca d'Água (`BJMARCA` e `BJGRVMAR`)
* **Uso direto e linear no código de origem:** A busca e atualização do horário de corte de cada entidade ocorrem **diretamente no fluxo onde são usadas**, dentro de `BJVarreEnt` ([BJPLA003.prw](BJPLA003.prw)) e no monitor `BJMudaMarca` ([BJPLA005.prw](BJPLA005.prw)), usando comandos padrão AdvPL (`dbSeek`, `RecLock`, `MsUnlock`).
* **Fim dos saltos entre fontes:** As funções intermediárias `BJMARCA` e `BJGRVMAR` foram completamente extintas de `BJPLA002.prw`. Quem lê `BJVarreEnt` entende o ciclo completo (busca do horário anterior, coleta, enfileiramento e atualização do horário) no mesmo fonte, sem precisar abrir múltiplos arquivos.

### 4. Numeração de Sequência da SZZ por SQL `MAX(ZZ_SEQUEN)`
* A obtenção da próxima sequência na fila foi padronizada via consulta SQL direta:
  `SELECT MAX(ZZ_SEQUEN) AS MAXSEQ FROM SZZ WHERE ZZ_FILIAL = ? AND D_E_L_E_T_ = ' '` incrementada com `Soma1()`.
* As chamadas legadas a `GetSxeNum("SZZ", "ZZ_SEQUEN")` e `ConfirmSx8()` foram removidas, evitando concorrência e dependência desnecessária no SXE/SX8.

### 5. Codificação Obrigatória em CP1252 / Windows-1252
* Todos os fontes `.prw` devem ser mantidos e validados estritamente em CP1252 (compatível com ASCII puro), nunca em UTF-8, validados através do script `.agents\skills\advpl-tlpp\utf8-to-cp1252-conversion\scripts\convert-encoding.bat`.

### 6. Arquitetura da Coleta sem Wrappers (Padrão SINCMAX / Máxima)
Definido em 08/09/2026 com base no funcionamento estável e consagrado em produção do `SINCMAX.prw`:
* **Queries Dedicadas (`Static Function <Alias>Qry`)**:
  Cada entidade/tabela possui uma `Static Function` responsável exclusiva por montar e retornar o comando SQL puro (ex: `SA1Qry`, `SA2Qry`, `SB1Qry`, `DA0Qry`, `SE1Qry`, etc.).
* **Nomes dos Campos no SQL idênticos ao JSON**:
  As queries SQL já apelidam as colunas (`AS`) com o nome exato da propriedade esperada pelo contrato JSON da API (ex: `SA1.A1_NOME AS razaoSocial`, `SA1.A1_NREDUZ AS nomeFantasia`, `SA1.A1_CGC AS cnpjCpf`).
* **Loop Único e Genérico de Criação do JSON**:
  O processador de coleta não utiliza funções separadas de JSON (como `SA1Json`) e nem wrappers (`BJPoeTexto`, `BJPoeData`). Um único `For` genérico percorre as colunas retornadas pela query (`For nI := 1 To (cAlias)->(FCount())`) e popula o `JsonObject`:
  `oJson[(cAlias)->(FieldName(nI))] := (cAlias)->(FieldGet(nI))`
* **Persistência Imediata na Fila `SZZ`**:
  Cada registro lido do cursor SQL é imediatamente gravado na tabela `SZZ` via `RecLock("SZZ", .T.)` com a próxima sequência obtida por `MAX(ZZ_SEQUEN)`, eliminando o acúmulo de arrays gigantes de objetos em memória AdvPL.
* **Execução Híbrida (Job Silencioso vs. Usuário com `MsNewProcess`)**:
  * **Via Schedule / Job (`_lJob == .T.` ou `IsBlind()`)**: executa de forma silenciosa em segundo plano registrando mensagens via `FwLogMsg`. Inclui ponto de entrada `JOBCOLETA(aPar)` com `PREPARE ENVIRONMENT`.
  * **Via Usuário / Interativo**: ativa componente visual `MsNewProcess` com barra de progresso de duas réguas:
    * **Régua 1**: Total de entidades/endpoints a varrer.
    * **Régua 2**: Total de registros lidos da query da entidade atual.
    * Suporte a cancelamento da operação pelo usuário (`lEnd`).
* **Atualização Imediata do Corte na `SZZ`**:
  Ao concluir a varredura de cada entidade sem interrupção, o registro de controle correspondente (`ZZ_CHVORI = "*CONTROLE*"`) é atualizado diretamente na `SZZ`.

![Status: In progress](https://img.shields.io/badge/status-In%20progress-yellow)

**Este é o único plano da integração.** Antes desta versão o assunto vivia em
cinco documentos, em dois repositórios, e eles se contradiziam em pontos que
custaram bug: a chave do estoque, o verbo do retorno, o nome dos fontes. Um
documento só, com um dono, não tem como divergir de si mesmo.

Dois repositórios participam:

| Lado | Repositório | O que mora lá |
|---|---|---|
| **Plataforma** | `C:\VPS\rcg` | API NestJS, contratos Zod, telas. A API está **entregue** |
| **ERP** | `C:\VPS\protheusrcg` | Fontes AdvPL em `Portal/BJ/`. É onde está o trabalho em aberto |

---

## 0. Mapa dos documentos

**Vivos — consulte:**

| Documento | Papel |
|---|---|
| **Este arquivo** | Plano da integração inteira. Estado, decisões, o que falta |
| `C:\VPS\rcg\docs\integração\README.md` | Contrato da API: autenticação, tenant, upsert, erros, paginação, ordem de carga |
| `C:\VPS\rcg\docs\integração\endpoints.md` | Referência rota a rota |
| `C:\VPS\rcg\docs\integração\swagger.md` | Padrão obrigatório ao criar endpoint novo |
| `C:\VPS\rcg\docs\integração\testes-swagger.json` | Payloads de teste na ordem de carga |
| `C:\VPS\rcg\docs\planos\compras-notas-entrada.md` | Registro da entrega de fornecedores e notas de entrada **do lado da plataforma** |

**Históricos — não siga, foram absorvidos por este arquivo:**

| Documento | Por que saiu de circulação |
|---|---|
| `Portal/BJ/README.md` | Descrevia os `BJIN*`, que saíram da pasta. Reescrito na Phase 9 (TASK-053) |
| `C:\VPS\rcg\docs\planos\integracao-codigo-erp.md` | A definição de `codigoErp` virou a seção 3 daqui. As etapas 11-15 apontavam para fontes que não existem mais |
| `C:\VPS\rcg\docs\planos\api-integracao-erp.md` | Já se autodeclarava histórico desde 24/07. Propunha lote como desenho único; o lote existe, mas ao lado do CRUD |

Cada um recebeu um aviso no topo apontando para cá. Ficaram no lugar porque
guardam decisões datadas — por que a chave da SF1 não leva o `F1_TIPO`, por que o
fornecedor é espelho read-only — que valem como registro mesmo depois de o plano
mudar.

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
 │  MATA415 cria o Orçamento│            │                          │
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
- **REQ-005**: Um monitor lista as mensagens da fila com status, payload, resposta e número de tentativas, e permite reenvio dirigido.
- **REQ-006**: Uma rotina agendável expurga mensagens executadas acima do prazo de retenção. Pendentes e com erro nunca são apagadas.
- **REQ-007**: Antes de criar um Orçamento a partir do que veio da plataforma, a rotina consulta a fila **e** a SCJ por `CJ_NUMEXT`; registro já existente não gera outro, apenas reenvia o aviso à plataforma.
- **REQ-008**: A integração cobre **todas as entidades que a API expõe**. Entidade documentada e não mapeada é lacuna, não escopo — hoje faltam `fornecedores` e `notas-entrada` (Phase 7).

### Restrições

- **CON-001**: A gravação da mensagem como executada acontece **dentro do mesmo `Begin Transaction`** do ExecAuto que gerou o documento. Ver **RISK-001**.
- **CON-002**: ~~Nada existente é alterado enquanto o trabalho corre.~~ **Encerrada em 08/09/2026** — os `BJIN*` foram movidos para `Portal/BJ/Remover/` e a restrição perdeu objeto.
- **CON-003**: **Nomes de arquivo são sequenciais**: `BJPLA001.prw` a `BJPLA005.prw` (`BJPLA006.prw` foi removido em 08/09/2026 pois todas as tabelas já possuem a coluna `S_T_A_M_P_` no banco de dados e a alteração dinâmica de schema é proibida).
- **CON-004**: `U_BJPLA001` tem exatamente 10 caracteres, o limite do RPO. Nenhum nome de função pode passar disso.
- **CON-005**: A tabela de fila é a **SZZ**, prefixo de campo `ZZ_`.
- **CON-006**: A API limita **60 req/min** nas rotas de integração e **120 req/min** no envio de XML, contados **por IP** — duas chaves do mesmo IP dividem o balde. O lote (`PUT`) tem o mesmo teto de requisições, mas leva até 1.000 registros em cada uma.
- **CON-007**: Os arquivos-fonte são gravados em **CP-1252**, nunca UTF-8. Os `.md` são UTF-8.
- **CON-008**: **`codigoErp` é a única chave que atravessa a fronteira.** O uuid da plataforma é interno e nunca sai, exceto no `PATCH /orcamentos/pendentes/{id}`. Ver seção 3.

### Padrões obrigatórios

- **PAT-001**: **Nomes dizem o que a função faz**, dentro do limite de 10 caracteres.
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

> **Plano de execução dos ajustes:** [BJPLA001 a BJPLA006](../../plan/refactor-bjpla-legibilidade-1.md).
> Roteiro subordinado ao plano principal, com tarefas, dependências e critérios de aceite. Estado: planejado.



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

A adoção inicial deve revisar BJPLA001 a BJPLA006 por responsabilidade,
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
> `At("/", cChave)` em `BJMAPEST` (TASK-044) e o exemplo errado no
> `endpoints.md` (TASK-050).

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
fontes somadas contariam a mesma devolução duas vezes. Ver TASK-048 — hoje esse
campo sobe fixo em zero.

**Pedido de Venda não tem endpoint.** Não existe model, tabela nem rota para SC5
na plataforma. Enviar pedido exigiria criar a entidade do lado de lá — está em
**Fora deste plano**.

### O prefixo de filial vale nos dois sentidos

**Toda referência que sai daqui volta prefixada.** A plataforma devolve
`clienteCodigo: "01-000123-01"` e `produtoCodigo: "01-11400443"` porque foi isso
que o ERP mandou. Quem recebe **tem de desmontar a string** antes de posicionar a
SA1 ou a SB1 — e é justamente o que hoje não acontece (TASK-043).

Mesma regra para o reenvio dirigido pelo monitor: a chave guardada em `ZZ_CHVORI`
é o `codigoErp` prefixado, e o mapeador que a recebe filtra por `B1_COD`, que não
tem prefixo nenhum.

---

## 4. O que já foi entregue

### 4.1 Plataforma — `C:\VPS\rcg`

A API está no ar e validada. Absorvido das etapas 1-10 do
`integracao-codigo-erp.md` e do `compras-notas-entrada.md`.

| # | Entrega | Onde |
|---|---|---|
| ✅ | **Schema + migration**: `codigoErp` com `@@unique([empresaId, codigoErp])` nas 8 tabelas que faltavam; `codigoLegado` removido. Aplicada no Postgres de dev | `apps/api/prisma/` |
| ✅ | **Contracts**: `codigoErp` obrigatório (`min(1).max(60)`) nos schemas de criação, inclusive nos filhos | `packages/contracts/src/integracao.ts` |
| ✅ | **Upsert sem 409**: `decidirUpsert()` decide criar / atualizar / reativar sem exceção | `integracao/common/decidir-upsert.ts` |
| ✅ | **13 endpoints** com CRUD por `codigoErp`, mestre-detalhe casando filho a filho por `sincronizarFilhos()` | `apps/api/src/modules/integracao/` |
| ✅ | **Fila de orçamentos pendentes** com as três regras do vínculo (uma vez só, só aprovado, sem colisão) | `integracao/orcamentos/` |
| ✅ | **Caminho do MySQL aposentado**: seis importadores, scripts e a dependência `mysql2` removidos | — |
| ✅ | **Lote `PUT`** em todas as entidades, até 1.000 registros, relatório por item, transação por registro (03/09) | `integracao/*/` |
| ✅ | **Fornecedores e notas de entrada**: tabelas, API e telas de consulta, acesso restrito a Administrador e Diretor (08/09) | `integracao/fornecedores/`, `integracao/notas-entrada/` |
| ✅ | **Smoke test** com chave real: POST cria, POST repetido atualiza a mesma linha, DELETE + GET dá 404, POST ressuscita, reenvio de tabela de preço mantém o uuid do item | — |

> Diferença encontrada no smoke test e documentada como comportamento real: o
> `POST` devolve **201 também na atualização** (o Nest não distingue). O corpo
> traz o estado final, e o ERP trata qualquer 2xx como sucesso.

### 4.2 ERP — `Portal/BJ`

Seis fontes escritos, **nenhum compilado ainda**.

| Fonte | O que faz | Estado |
|---|---|---|
| `BJPLA001.prw` | Quatro rotinas agendáveis: coleta, envio, retorno, expurgo | ✅ escrito |
| `BJPLA002.prw` | Catálogo, cliente HTTP, fila, semáforo, filtro de `S_T_A_M_P_`, marca d'água, memória, expurgo | ✅ escrito |
| `BJPLA003.prw` | Mapeadores, varredura que enfileira, drenagem que envia | ✅ escrito |
| `BJPLA004.prw` | Orçamento da plataforma → SCJ por `MATA415`; alteração de cliente → SA1 | ⚠️ escrito, **não funciona** — TASK-043 |
| `BJPLA005.prw` | Monitor: fila, payload, resposta, reenvio, marca d'água | ✅ escrito |
| `BJPLA006.prw` | Preparação da coluna `S_T_A_M_P_`; dicionário conferido pelo Configurador | ✅ escrito |

**Conformidade verificada em 08/09/2026**: nenhum `IIF`, `ConOut`, `Function`
pública, `cFilial`, `FwFreeObj` ou driver ISAM. `FWExecStatement` parametrizado
em toda query. Fontes em ASCII puro, sem risco de corrupção CP-1252. Nomes de
campo do payload conferidos um a um contra os schemas Zod: **batem**.

> **`BJPLA.CH` não existe.** O plano previa um include comum (FILE-000); a
> implementação repetiu os `#Define` em cada fonte, porque diretiva de
> pré-processador não atravessa fonte e o include somaria um arquivo para ler.
> Custo assumido: mudar um status significa mudar em cinco lugares. Se voltar a
> incomodar, o include é a saída — e aí é uma tarefa própria.

---
## 5. Implementation Steps

As Phases 1 a 5 estão fechadas. **As Phases 6 e 7 são novas nesta versão**:
saíram da revisão de 08/09/2026 e da unificação dos planos, e bloqueiam a
homologação.

### Phase 1 — Dicionário

- GOAL-001: A SZZ existe e é usável.

| Task | Descrição | ✅ | Data |
|------|-----------|---|------|
| TASK-001 | Confirmar que o alias `SZZ` não existe no dicionário desta base | ✅ | 2026-09-01 |
| TASK-002 | Conferir no SX2 o tamanho do campo de filial. Os fontes fixam `"01"`, o que aponta C(2) | ✅ | 2026-09-08 |
| TASK-003 | Cadastrar SX2, SX3, SIX **e SXE** da SZZ pelo Configurador, conforme **seção 6**. O SXE de `ZZ_SEQUEN` é obrigatório: a numeração sai de `GetSxeNum` | ✅ | 2026-09-08 |

### Phase 2 — Infraestrutura (`BJPLA002`)

- GOAL-002: A fila, o transporte e o controle de janela existem.

| Task | Descrição | ✅ | Data |
|------|-----------|---|------|
| TASK-004 | Cliente HTTP: `FWRest` para GET/POST/PUT/DELETE e `HTTPQuote()` para PATCH, atrás de uma assinatura só. Timeout, retentativa, tradução do erro, sucesso na faixa 2xx | ✅ | 2026-09-01 |
| TASK-005 | ~~Função de conversão de data para ISO 8601~~ **Cancelada por PAT-002** — seria envelope de `FWTimeStamp`. A conversão é escrita no ponto de uso: `FWTimeStamp(3, dData, "00:00:00") + "Z"`, formato 3 porque não converte fuso. Virou TEST-010 | ❌ | 2026-09-01 |
| TASK-006 | A fila: enfileirar, ler pendentes por tipo, gravar resultado, incrementar tentativa | ✅ | 2026-09-01 |
| TASK-007 | Semáforo: um processo por vez, por entidade | ✅ | 2026-09-01 |
| TASK-008 | Filtro de `S_T_A_M_P_`, **sem degradação** — tabela sem a coluna faz a query falhar, e é o comportamento certo: degradar em silêncio mandaria a tabela inteira a cada ciclo sem ninguém perceber | ✅ | 2026-09-01 |
| TASK-009 | Catálogo das entidades na ordem de carga que a API exige | ✅ | 2026-09-01 |
| TASK-010 | Marca d'água por entidade, lida e gravada na própria SZZ. Não existe `MV_BJAPI04` na estrutura nova | ✅ | 2026-09-01 |
| TASK-040 | Memória da integração: dada entidade e chave, dizer se já existe mensagem executada e que documento gerou | ✅ | 2026-09-01 |
| TASK-041 | Lógica do expurgo, preservando pendentes, com erro e a linha de marca d'água | ✅ | 2026-09-01 |

### Phase 3 — Mapeadores e motor (`BJPLA003`)

- GOAL-003: Toda entidade do catálogo sabe virar JSON, e a fila sabe drená-la.

| Task | Descrição | ✅ | Data |
|------|-----------|---|------|
| TASK-011 | Mapeadores de cadastro: SZ0, SE4, NNR, SA3, SA1, DA0+DA1, SB2 | ✅ | 2026-09-01 |
| TASK-012 | Categorias em dois níveis: SZ1 como raiz e SBM como filha, SZ1 primeiro no array porque a API exige a pai antes | ✅ | 2026-09-01 |
| TASK-013 | Produtos (SB1): `categoriaCodigo` de `B1_TPRCG`, `subCategoriaCodigo` de `B1_GRUPO`. **Sem `marca`** — não existe campo neste dicionário | ✅ | 2026-09-01 |
| TASK-014 | Transacionais: notas de saída (SF2+SD2), títulos (SE1, com cobrança bancária), orçamentos (SCJ+SCK) | ✅ | 2026-09-01 |
| TASK-015 | XML da NF-e via TSS (`WSNFeSBRA`, `RetornaNotasNX`), como entidade própria do catálogo logo após as notas | ✅ | 2026-09-01 |
| TASK-016 | Varredura: percorre o catálogo, chama o mapeador e enfileira. Registro ativo gera POST (upsert), excluído gera DELETE com a mesma chave | ✅ | 2026-09-01 |
| TASK-017 | Drenagem: lê as pendentes na ordem da sequência, executa, grava o resultado, respeita a pausa entre requisições | ✅ | 2026-09-01 |

### Phase 4 — Retorno (`BJPLA004`)

- GOAL-004: O que a plataforma produz chega ao ERP sem duplicar.

| Task | Descrição | ✅ | Data |
|------|-----------|---|------|
| TASK-018 | Leitura paginada de `GET /integracao/orcamentos/pendentes` e enfileiramento como mensagem de entrada | ✅ | 2026-09-01 |
| TASK-019 | Duas linhas de defesa antes de criar: a fila e a SCJ por `CJ_NUMEXT`. Qualquer uma que responda faz a rotina só reenviar o `PATCH` | ✅ | 2026-09-01 |
| TASK-020 | Criação do **Orçamento** (SCJ/SCK) por `MATA415` ExecAuto. `CJ_NUMEXT` C(36) guarda o UUID; TES de `B1_TS`, armazém de `B1_LOCPAD`; `RollBackSx8` em laço na recusa | ✅ | 2026-09-01 |
| TASK-021 | A mensagem passa a executada com o número do orçamento em `ZZ_CHVDES` **dentro do mesmo `Begin Transaction`** — ver **CON-001** | ✅ | 2026-09-01 |
| TASK-022 | `PATCH .../pendentes/{id}` com o `codigoErp` do orçamento **como texto**, no formato `filial-CJ_NUM` | ✅ | 2026-09-01 |
| TASK-023 | Retorno de alteração de cliente para a SA1. A rota não existe na API — registra 404 e não quebra o ciclo. Ver **DEP-005** e TASK-051 | ✅ | 2026-09-01 |

### Phase 5 — Agendamentos e monitor (`BJPLA001`, `BJPLA005`)

- GOAL-005: A integração roda sozinha e dá para olhar por dentro.

| Task | Descrição | ✅ | Data |
|------|-----------|---|------|
| TASK-024 | Agendamento de **coleta** — varre e enfileira | ✅ | 2026-09-01 |
| TASK-025 | Agendamento de **envio** — drena a fila de saída | ✅ | 2026-09-01 |
| TASK-026 | Agendamento de **retorno** — lê, enfileira, aplica e atualiza a plataforma | ✅ | 2026-09-01 |
| TASK-027 | Agendamento de **expurgo** | ✅ | 2026-09-01 |
| TASK-028 | `SchedDef` para os quatro | ✅ | 2026-09-01 |
| TASK-029 | Monitor: lista da fila com filtro por status, entidade e período | ✅ | 2026-09-01 |
| TASK-030 | Monitor: abrir uma mensagem e ver payload, resposta e tentativas | ✅ | 2026-09-01 |
| TASK-031 | Monitor: reenviar mensagem e alterar a marca d'água de uma entidade | ✅ | 2026-09-01 |

### Phase 6 — Correções da revisão de 08/09/2026 ⛔ bloqueia a homologação

- GOAL-006: O que está escrito passa a funcionar. **Nenhuma destas é melhoria —
  são defeitos que impedem o fluxo de rodar.**

| Task | Descrição | ✅ | Data |
|------|-----------|---|------|
| TASK-043 | ⛔ **De-para do prefixo de filial, nos dois sentidos.** O sentido de volta trata o `codigoErp` como se fosse o campo cru: `BJPLA004:472` corta `"01-000123-01"` em `"01-000123-"`; `BJPLA004:643` procura `"01-11400443"` na SB1; `BJPLA004:918` repete o erro na alteração de cliente; `cVend` e `cCond` gravam `"01-000234"` em `CJ_VEND1`. **Consequência: nenhum orçamento da plataforma vira orçamento no ERP.** O mesmo vale para o `cChave` de **todos** os mapeadores, que recebem a chave prefixada da SZZ e filtram por `B1_COD` — o reenvio dirigido do monitor não reprocessa nada | | |
| TASK-044 | ⛔ `BJMAPEST:1491` parte o `cChave` por `"/"`, mas a chave é `01-11400443-001`, com hífen. `At("/")` devolve 0 e a query filtra por produto vazio. Herdado da frase errada do plano absorvido — ver a nota da seção 3 | | |
| TASK-048 | `vlrDevolucao` do cabeçalho da nota de saída sobe fixo em `0` (`BJPLA003:1699`), embora os itens tragam `vlrDev` e `quantidadeDev`. É esse campo que responde pelas devoluções nas apurações — somar `D2_VALDEV` | | |
| TASK-052 | `ZZ_TENTAT` é zerado a cada re-enfileiramento (`BJPLA002:634`), então o teto de `BJ_MAXTENT` nunca é alcançado se a coleta reenfileirar antes. Preservar a contagem quando a mensagem já existia | | |
| TASK-054 | `ConfirmSx8()` é chamado antes do `RecLock` em `BJENFILA` — se a gravação falhar, o número é queimado. Mover para depois do `MsUnlock` | | |
| TASK-056 | ⛔ **O JOIN de `U_BJMAPNFS` liga SF2↔SD2 por três campos, e a nota é identificada por cinco.** O `codigoErp` da nota de saída leva `F2_TIPO` e `F2_ESPECIE` justamente porque `F2_DOC`+`F2_SERIE` **não** identificam o documento sozinhos (normal, devolução e beneficiamento compartilham numeração) — mas o `LEFT JOIN` casa só `FILIAL`+`DOC`+`SERIE`. Duas notas nessa situação viram produto cartesiano: cada uma sobe com os itens das duas, e os `codigoErp` de item também colidem, porque tampouco levam tipo e espécie. Acrescentar `D2_TP`/espécie ao `ON`, ao `EXISTS` e à `ORDER BY`, como foi feito em `U_BJMAPNFE` (07 campos) em 08/09. **Achado ao revisar o mapeador novo** | | |

### Phase 7 — Cobertura que falta ⛔ bloqueia a primeira carga

- GOAL-007: A integração cobre tudo o que a API expõe, e a carga inicial cabe
  numa janela.

| Task | Descrição | ✅ | Data |
|------|-----------|---|------|
| TASK-045 | **Mapeador de fornecedores** (SA2 → `/integracao/fornecedores`): `U_BJMAPFOR`, no catálogo entre `clientes` e `tabelas-preco`. Cadastro enxuto, sem carteira nem crédito. Campos opcionais deste dicionário (`A2_INSCRM`, `A2_CONTATO`, `A2_CEL`, `A2_OBSERV`, `A2_TIPO`) guardados por `FieldPos()` | ✅ | 2026-09-08 |
| TASK-046 | **Mapeador de notas de entrada** (SF1+SD1 → `/integracao/notas-entrada`): `U_BJMAPNFE`, no catálogo entre `notas-saida-xml` e `titulos-receber`. Mestre-detalhe no molde da nota de saída, com `LEFT JOIN` e o delta num `EXISTS` no nível da nota. `F1_TIPO = 'D'` manda `clienteCodigo`, o resto manda `fornecedorCodigo`. Duas datas: `dtEmissao` (`F1_EMISSAO`) e `dtEntrada` (`F1_DTDIGIT`). Item **sem `ncm`**. Sem rotas de XML | ✅ | 2026-09-08 |
| TASK-055 | `U_BJSEMFIL` — tira o prefixo de filial de um `codigoErp`. Escrita junto com TASK-045/046 para os mapeadores novos não nascerem com o bug de TASK-043, e é a peça que TASK-043 vai aplicar no resto | ✅ | 2026-09-08 |
| TASK-047 | **Lote `PUT`** na drenagem: agrupar mensagens pendentes por entidade em blocos de até 1.000 e usar `PUT /integracao/<entidade>` com `{"registros":[…]}`. O relatório volta com `indice`, `codigoErp` e `mensagem` por item — cada mensagem da fila recebe o resultado dela. Um registro inválido não desfaz os que passaram. **Sem isso a carga inicial medida é ~35 h; com lote, ~14 min** | | |
| TASK-049 | Segunda passada de XML por `?semXml=true`: nota enviada antes da autorização na SEFAZ não tem XML no TSS naquele instante, e é essa varredura que a alcança depois. Hoje o XML é reenviado a cada mudança da SF2 | | |
| TASK-051 | **Decidir com a plataforma** o retorno de alteração de cliente — **spec de desenvolvimento no apêndice C**. A rota `/integracao/clientes/alteracoes` que o `BJPLA004` chama **não existe** — a fila de aprovação é interna. Ou a API expõe a rota, ou TASK-023 sai do escopo e o código é removido | | |

### Phase 8 — Homologação e primeira carga

- GOAL-008: A integração roda em produção.

| Task | Descrição | ✅ | Data |
|------|-----------|---|------|
| TASK-032 | `BJPLA006`: criar a coluna `S_T_A_M_P_` nas tabelas lidas, **incluindo SZ1, SA2, SF1 e SD1**; conferir os parâmetros pelo Configurador, sem rotina de acesso direto ao dicionário | | |
| TASK-033 | Compilar os seis fontes | | |
| TASK-034 | Conferir os payloads contra `testes-swagger.json`, campo a campo | | |
| TASK-035 | Cadastrar `MV_BJAPI01` a `MV_BJAPI03`, rodar `U_BJPLA006()` em ambiente exclusivo, cadastrar o menu do monitor e os quatro agendamentos | | |
| TASK-042 | **Ajustar o `MA415END.prw`**: desvio por `IsBlind()` no topo, para o EP não chamar `MsgYesNo`, `MostraErro` nem `MsgInfo` sem interface — e não efetivar por conta própria. Ver o apêndice B. **Bloqueia o primeiro retorno em produção** | | |
| TASK-036 | Primeira carga, entidade por entidade, na ordem do catálogo | | |

### Phase 9 — Desmonte

- GOAL-009: Só a estrutura nova sobra.

| Task | Descrição | ✅ | Data |
|------|-----------|---|------|
| TASK-037 | Apagar `Portal/BJ/Remover/` (os onze `BJIN*`) | ⏳ movidos em 08/09 | |
| TASK-050 | Corrigir o estoque em `docs/integração/endpoints.md`: a "Visão geral" e as "Receitas rápidas" ainda mostram `/estoque/{produtoCodigo}/{armazemCodigo}`; a rota real é `/estoque/{codigoErp}` | | |
| TASK-053 | Reescrever o `Portal/BJ/README.md` para a estrutura de seis fontes. Hoje descreve os `BJIN*` e tem 12 links quebrados | | |
| TASK-039 | Conferir se há objeto `BJIN*` no RPO e removê-lo. Nunca foram compilados segundo **RISK-003** — esta tarefa confirma ou desmente | | |

---

## 6. Estrutura da SZZ

Uma linha por mensagem.

| Campo | Tipo | Conteúdo |
|---|---|---|
| `ZZ_FILIAL` | C(2) | Filial |
| `ZZ_SEQUEN` | C(9) | Sequência — a ordem de chegada, e a ordem de consumo |
| `ZZ_TIPO` | C(1) | `S` saída · `E` entrada |
| `ZZ_ENTID` | C(20) | Entidade do catálogo. 20 cabe o maior id: `orcamentos-pendentes` |
| `ZZ_CHVORI` | C(60) | **Chave de origem.** `codigoErp` na saída, id da plataforma na entrada |
| `ZZ_VERBO` | C(6) | POST · PATCH · DELETE · GET · PUT |
| `ZZ_JSON` | Memo | O payload. Permite reenviar sem varrer a origem de novo |
| `ZZ_STATUS` | C(1) | Pendente · executada · erro · cancelada |
| `ZZ_DTCRIA` | D | Data em que entrou na fila |
| `ZZ_HRCRIA` | C(8) | Hora em que entrou na fila |
| `ZZ_DTEXEC` | D | Data da última execução |
| `ZZ_HREXEC` | C(8) | Hora da última execução |
| `ZZ_TENTAT` | N(3) | Tentativas. Acima de um teto, para de tentar sozinha |
| `ZZ_HTTP` | N(3) | Código da última resposta |
| `ZZ_RETORN` | Memo | A resposta da API, íntegra — sucesso ou erro |
| `ZZ_CHVDES` | C(60) | **Chave de destino.** O documento gerado do outro lado na entrada; o id da plataforma na saída |
| `ZZ_MARCA` | C(19) | Marca d'água UTC `AAAA-MM-DD HH:MM:SS`. Só na linha de controle da entidade |

**`ZZ_SEQUEN` precisa de cadastro no SXE.** A numeração sai de
`GetSxeNum("SZZ", "ZZ_SEQUEN")`, o semáforo do próprio Protheus. Sem ele, dois
jobs que enfileirem ao mesmo tempo — a coleta e o retorno rodam em agendamentos
separados — receberiam a mesma sequência.

**A marca d'água mora na própria fila.** Cada entidade tem **uma** linha de
controle, com `ZZ_CHVORI = "*MARCA*"`, status executada e `ZZ_MARCA` preenchido,
atualizada no lugar a cada varredura. Não é um segundo mecanismo: é o mesmo
assunto — o que a integração já fez. O expurgo nunca a apaga, senão a entidade
recuaria 30 dias na varredura seguinte.

Três campos da lista original saíram por serem deriváveis: **origem** e
**destino** (o tipo já os determina) e **rota** (o catálogo sabe montá-la a
partir da entidade e da chave). Os dois logs viraram um: o código HTTP diz se foi
sucesso ou erro.

### Índices

| Ordem | Chave | Para quê |
|---|---|---|
| 1 | `ZZ_FILIAL + ZZ_SEQUEN` | Chave única |
| 2 | `ZZ_FILIAL + ZZ_STATUS + ZZ_DTCRIA` | O drenador e o monitor. É o índice quente |
| 3 | `ZZ_FILIAL + ZZ_ENTID + ZZ_CHVORI` | Pela origem: "essa chave já foi enviada?" |
| 4 | `ZZ_FILIAL + ZZ_CHVDES` | Pelo destino: dado o documento, achar a mensagem que o gerou |

---

## 7. Os dois fluxos

### Saída — dois passos onde havia um

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
   id já executada? Então o documento já foi gerado, e falta só reenviar o aviso
   do passo 4. Nada é gerado de novo. A SCJ por `CJ_NUMEXT` é a segunda linha de
   defesa, e responde mesmo depois de a fila ser expurgada.
3. **`Begin Transaction`** — o `MATA415` grava a SCJ e, na mesma transação, a
   mensagem passa a executada com o número do orçamento em `ZZ_CHVDES`. Se a
   marcação falhar, o orçamento volta atrás com ela.
4. `PATCH .../pendentes/{id}` com o `codigoErp` gerado.

> **A garantia inteira depende do passo 3.** Se a gravação sair de dentro do
> `Begin Transaction`, a fresta reabre sem nenhum sintoma visível: volta a
> existir o intervalo em que o documento está na SCJ e a plataforma não sabe, e o
> ciclo seguinte gera um segundo.

---

## 8. Alternatives

- **ALT-001**: **Um campo novo na SC5** guardando o id do orçamento, em vez do `CJ_NUMEXT` da SCJ. Rejeitado: exige mexer no dicionário, e o desenho final nem chega a criar pedido.
- **ALT-002**: **Arquivo em `\bjapi\<empresa>\`** guardando o vínculo. Não mexe no dicionário, mas o estado sai do banco e some do backup — foi o que a estrutura anterior fazia, e é o que este plano desfaz.
- **ALT-003**: **Outbox com escrita no evento**, por Ponto de Entrada em cada rotina. Rejeitado: espalha a integração por Pontos de Entrada sobre rotinas padrão e ainda assim não detecta purge físico.
- **ALT-004**: **Adaptar os fontes `BJIN*`** em vez de escrever novos. Rejeitado — e o tempo confirmou: eles nunca foram compilados, então não havia base instalada a preservar.
- **ALT-005**: **Uma linha por chave** em vez de uma por mensagem. Tabela menor, mas perde o histórico de tentativas e o rastro de o que foi enviado quando.
- **ALT-006**: **Reaproveitar o `BJIN999`** para a preparação de ambiente. Rejeitado: nasceu `BJPLA006`, e o `BJIN999` foi para `Remover/`.
- **ALT-007**: **Só lote, sem CRUD individual.** Era o desenho do `api-integracao-erp.md`. Rejeitado dos dois lados: o lote é o caminho da carga inicial e da ressincronização, mas uma alteração isolada no dia a dia não deve esperar formar bloco. Os dois convivem — TASK-047.

---

## 9. Dependencies

- **DEP-001**: **SZZ cadastrada no dicionário** (SX2, SX3, SIX, SXE). Bloqueia tudo a partir da Phase 2. Cadastro manual pelo Configurador.
- **DEP-002**: **DBAccess 20.1.1.0 ou superior**, para a coluna `S_T_A_M_P_` mantida por gatilho.
- **DEP-003**: **Chave de API (`itg_...`) por empresa**, obtida em *Administração > Integração*. Uma chave por empresa, logo um agendamento por empresa.
- **DEP-004**: **TSS configurado** (`WSNFeSBRA`), para o envio do XML da NF-e.
- **DEP-005**: **Rota de alteração de cliente na API.** TASK-023 fica inerte até ela existir — ou até TASK-051 decidir que não vai existir.

---

## 10. Files

Em `Portal/BJ/`:

- **FILE-001**: `BJPLA001.prw` — **Schedules.** As quatro rotinas agendáveis, cada uma com seu `SchedDef`. É o que se cadastra no Configurador.
- **FILE-002**: `BJPLA002.prw` — **Comuns.** Cliente HTTP, fila, semáforo, filtro de `S_T_A_M_P_`, catálogo, marca d'água, memória e expurgo. Todos dependem dele; ele não depende de nenhum.
- **FILE-003**: `BJPLA003.prw` — **Coleta para envio.** Os mapeadores, a varredura que enfileira e a drenagem que envia.
- **FILE-004**: `BJPLA004.prw` — **Gravação de recebidos.** Orçamento da plataforma → SCJ, e alteração de cliente → SA1.
- **FILE-005**: `BJPLA005.prw` — **Monitor.** Lista da fila, leitura de uma mensagem, reenvio e ajuste da marca d'água.
- **FILE-006**: `BJPLA006.prw` — **Ambiente.** Coluna `S_T_A_M_P_` nas tabelas lidas. SZZ e parâmetros devem ser conferidos pelo Configurador.

Fora de `Portal/BJ/`, um único fonte é tocado: `Faturamento/Ponto de Entrada/MA415END.prw` (TASK-042, apêndice B).

### Em `Portal/BJ/Remover/`

Os onze `BJIN*` da estrutura anterior, movidos em 08/09/2026. Nenhum `BJPLA*`
chama qualquer função deles — os prefixos `BJPL*` e `BJI*` não colidem. Apagados
em TASK-037.

---

## 11. Testing

- **TEST-001**: Conferir cada payload dos mapeadores contra `testes-swagger.json`, campo a campo.
- **TEST-002**: Enfileirar uma entidade sem drenar, e confirmar que a marca d'água avançou e nada chegou à plataforma.
- **TEST-003**: Drenar com a API indisponível, e confirmar que as mensagens continuam pendentes com `ZZ_TENTAT` incrementado, e que a varredura seguinte não as duplica.
- **TEST-004**: **Duplicidade.** Interromper o processo entre o passo 3 e o 4 da entrada. Na execução seguinte, confirmar que nenhum documento novo é gerado e que só o `PATCH` é reenviado.
- **TEST-005**: **Transação.** Forçar falha na gravação da mensagem dentro do `Begin Transaction` e confirmar que o orçamento não fica na SCJ.
- **TEST-006**: Excluir um registro na origem e confirmar que a mensagem sai com `DELETE`, e que 404 é tratado como resolvido.
- **TEST-007**: Rodar o expurgo e confirmar que pendentes e com erro nunca são apagadas, independente da idade.
- **TEST-008**: Categorias — confirmar que a SZ1 sobe antes da SBM e que o produto referencia `B1_TPRCG` e `B1_GRUPO`, ambos já existentes na plataforma.
- **TEST-009**: Compilar os seis fontes sem erro e sem aviso novo.
- **TEST-010**: Revisar cada função contra PAT-002: se apagar a função e colar o corpo em cada chamada deixasse o código igual ou mais claro, a função sobra e tem de sair.
- **TEST-011**: **Ida e volta da chave** (TASK-043). Criar um orçamento na plataforma para um cliente e um produto que subiram daqui, rodar o retorno e confirmar que a SCJ recebeu o cliente, o produto, o vendedor e a condição certos — não a string prefixada.
- **TEST-012**: **Reenvio dirigido.** Pelo monitor, reenviar uma chave de cada entidade e confirmar que o mapeador achou o registro. Hoje nenhum acha.
- **TEST-013**: **Lote** (TASK-047). Mandar 1.000 registros com um inválido no meio e confirmar que os 999 entraram, que o inválido volta em `erros` com o `indice` certo, e que a mensagem correspondente na fila ficou com erro e as outras executadas.
- **TEST-014**: **Devolução** (TASK-046, TASK-048). Uma devolução de venda `'D'` aparece na aba *Devoluções* da Posição de Cliente, e o valor não é contado duas vezes nas apurações.

---

## 12. Risks & Assumptions

- **RISK-001**: **A transação do ExecAuto.** Um refactor que tire a gravação da mensagem de dentro do `Begin Transaction` reabre a duplicidade sem sintoma visível — nada quebra, nada avisa, e o problema só aparece no dia em que a rede cair na hora errada. Mitigação: TEST-005 e comentário no ponto.
- **RISK-002**: **Tamanho do `BJPLA003`.** Já passa de 3.000 linhas, e as TASK-045/046 acrescentam mais. Quando ficar difícil de navegar, a saída é separar os mapeadores de cadastro dos transacionais num fonte a mais, com o próximo número da sequência.
- **RISK-003**: **Escrita a partir de código nunca executado.** Os `BJIN*` nunca foram compilados, rodados nem colocados em produção. O que foi aproveitado deles é desenho, não código validado. Em compensação, **não há base instalada para migrar**: nem histórico de envio, nem marca d'água em uso, nem dado na plataforma vindo desta integração. A estrutura nova começa do zero. TASK-039 confirma o lado do RPO.
- **RISK-004**: **Crescimento da SZZ.** Uma linha por mensagem cresce com o número de alterações, não com o tamanho da base. Sem o expurgo rodando, cresce indefinidamente.
- **RISK-005**: **Duas integrações no mesmo RPO.** Enquanto os `BJIN*` existirem em `Remover/`, basta alguém compilar e agendar um deles para os dois saírem pelo mesmo IP, dividindo o balde de 60 req/min e disputando as mesmas chaves. Mitigação: TASK-037.
- **RISK-006**: **O `MA415END` chama `MsgYesNo` em job.** Ver apêndice B e TASK-042.
- **RISK-007**: **Documentação divergindo de novo.** Foi o que produziu TASK-044. Mitigação: este arquivo é o único plano, e a seção 3 é a única definição das chaves. Contradição entre este arquivo e `docs/integração/` é bug de documentação e vira tarefa, não é resolvida na conversa.
- **ASSUMPTION-001**: O campo de filial desta base tem 2 posições. Os fontes fixam `"01"` — TASK-002.
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

## 13. Decisões em aberto

1. **Mensagem pendente repetida.** O produto mudou três vezes antes de a fila ser drenada: acumula três mensagens, ou a pendente é substituída pela mais recente? O código hoje **substitui** — mantém a fila curta, e a plataforma recebe o mesmo estado final. Falta ratificar, porque é o que também zera o `ZZ_TENTAT` (TASK-052).
2. **Retenção.** Por quanto tempo a mensagem executada fica antes do expurgo. O código usa 90 dias como padrão. É o único número que dimensiona a SZZ, então precisa sair antes da primeira carga.
3. **Alteração de cliente.** TASK-051 — a rota existe ou o requisito sai.

---

## 14. Fora deste plano

| Item | Situação |
|---|---|
| Objetivos de venda | Sem origem definida no ERP. A entidade nasce inativa no catálogo, e o mapeador é um esqueleto |
| Pedido de Venda (SC5/SC6) | Não há model, tabela nem rota na plataforma. Exigiria criar a entidade do lado de lá |
| `CK_NUMPV` | O vínculo orçamento → pedido existe no ERP, mas o contrato não tem campo para ele |
| Purge físico | Linha removida do banco não aparece em varredura nenhuma. Só por reenvio dirigido pelo monitor |
| `regraDescontoCodigo` nos itens | Sem campo confirmado na SB1, DA1, SD2 ou SCK deste dicionário. Vai `null` |
| Consultas gerenciais de compra | Decisão da plataforma em 08/09: nasceriam sobre dados que ainda não existem |

---

## 15. Divergências conhecidas entre os documentos da API

| Ponto | O que diverge | O que o código faz |
|---|---|---|
| `POST /notas-saida/{codigoErp}/xml` | `endpoints.md` documenta corpo JSON com `xml` **ou** `xmlBase64`, com curl executável; `testes-swagger.json` anota `multipart/form-data` | Segue o `endpoints.md` e manda `xmlBase64`. Se o primeiro envio voltar **415**, é este o motivo — e aí o caminho é multipart, que o `FWRest` não monta sozinho |
| Rota do estoque | `endpoints.md` mostra `/estoque/{produtoCodigo}/{armazemCodigo}` na "Visão geral" e nas "Receitas rápidas"; a seção de Estoque e o controller usam `/estoque/{codigoErp}` | Envia certo, na rota de um segmento. O reenvio dirigido lê errado — TASK-044. Documentação corrigida em TASK-050 |
| `dataRetorno` no orçamento | Não citado no `endpoints.md`, aparece no payload de teste | Não é enviado. Não há campo confirmado na SCJ que o alimente |

---

## Apêndice A — Entrada: orçamento, não pedido

Decidido em 01/09/2026. O orçamento aprovado na plataforma vira um **Orçamento
(SCJ/SCK) por `MATA415`**, não um Pedido de Venda direto. A integração para aí; a
efetivação em pedido continua sendo do operador, pela opção *Aprovar* do browse
(`U_AprvOrc`, em `MA415MNU.prw` — **referência, não é alterado**).

Isso mantém a aprovação de orçamento do ERP no lugar dela e dá dois vínculos
nativos, sem criar campo nenhum:

| Campo | Tam | O que guarda |
|---|---|---|
| `CJ_NUMEXT` | C(36) | O UUID da plataforma — cabe inteiro, e é o que deixa o ERP responder sozinho se já recebeu aquele orçamento |
| `CK_NUMPV` | C(6) | O pedido, gravado pelo próprio `MATA416` quando alguém efetiva |

**Duas linhas de defesa contra duplicidade**, e a segunda é nova: a fila responde
mais rápido, mas a consulta à SCJ por `CJ_NUMEXT` responde mesmo depois de a fila
ter sido expurgada — porque a resposta está no próprio documento.

**Cliente bloqueado não é liberado** neste caminho. Um orçamento é proposta, não
venda: destravar permanentemente um cliente bloqueado por crédito para registrar
uma proposta custa mais do que rende. Se o `MATA415` recusar por bloqueio, o erro
aparece na fila e a decisão fica com quem opera. (No desenho anterior, de pedido
direto, a liberação existia por herança do `IMPPED`.)

### RISK-006 — o `MA415END` chama `MsgYesNo` em job

O Ponto de Entrada [`MA415END.prw`](../../Faturamento/Ponto%20de%20Entrada/MA415END.prw)
dispara ao fim do `MATA415` e pergunta *"Deseja Efetivar o Orçamento?"* por
`MsgYesNo`. Em agendamento não há quem responda: dependendo da versão, a chamada
devolve o padrão ou **prende a thread até o timeout**.

Ver o **apêndice B**, no fim deste documento, para
o que precisa mudar e por quê (`TASK-042`).

O `U_BJRETORNO` detecta o EP por `ExistBlock` e grava um aviso no log, porque se
o retorno parar sem erro nenhum esse é o primeiro lugar a olhar. A correção real
é um desvio por `IsBlind()` dentro do EP — que não faço, porque o fonte é
referência e não se altera.


---

---

## Apêndice B — ajuste necessário no `MA415END.prw`

**Este é o único fonte fora de `Portal/BJ/` que a integração exige mexer**, e ele
não foi alterado: é referência, e a mudança é sua. Está registrado aqui como
`TASK-042`, na Phase 8, porque bloqueia o primeiro retorno em produção.

### O fonte hoje

[`Faturamento/Ponto de Entrada/MA415END.prw`](../../Faturamento/Ponto%20de%20Entrada/MA415END.prw)
dispara ao fim do `MATA415` — inclusive quando quem chamou o `MATA415` foi um
ExecAuto — e faz três chamadas de interface:

```advpl
If nTipo == 1 .And. nOper <> 3
    DbSelectArea("SCJ")
    If MsgYesNo("Deseja Efetivar o Orçamento nº: "+SCJ->CJ_NUM+" ?","ATENÇÃO!")
        aAdd(aCab,{"CJ_NUM", SCJ->CJ_NUM, nil})
        MATA416(aCab, aItens)
        If lMsErroAuto
            MostraErro()          // janela
        Else
            MsgInfo(...)          // janela
        EndIf
    EndIf
    RestArea(aArea)
EndIf
```

### Três problemas, em ordem de gravidade

**1. `MsgYesNo` em job trava ou responde sozinho.** No agendamento não há quem
clique. Dependendo da versão do AppServer, a chamada devolve o padrão ou prende a
thread até o timeout. Se o retorno parar sem erro nenhum no log, é aqui.

**2. Dupla efetivação.** Se o `MsgYesNo` responder afirmativamente sozinho, o EP
chama `MATA416` — e o `BJEfetiva`, logo depois, chama de novo. A segunda chamada
falha porque o orçamento já foi efetivado, e a integração registra um **erro que
não existe**: o pedido foi gerado, mas a mensagem fica marcada com falha.

**3. `MostraErro` e `MsgInfo` abrem janela** que ninguém fecha, pelo mesmo motivo
do item 1.

### O ajuste

Um desvio no topo da função, antes de qualquer coisa. `IsBlind()` é verdadeiro em
qualquer execução sem interface — job, ExecAuto por integração, WebService —, que
é exatamente quando nenhuma das três chamadas faz sentido:

```advpl
User Function MA415END()
    Local nTipo := PARAMIXB[1]
    Local nOper := PARAMIXB[2]
    Local aCab  := {}
    Local aItens:= {}
    Local aArea := GetArea()
    PRIVATE lMsErroAuto := .F.

    // Execução sem interface (job, ExecAuto da integração BJ): não há quem
    // responda ao MsgYesNo, e quem chamou já decide sobre a efetivação.
    If IsBlind()
        RestArea(aArea)
        Return
    EndIf

    If nTipo == 1 .And. nOper <> 3
        ... (o resto como está hoje)
    EndIf

    RestArea(aArea)
Return
```

Duas observações sobre o trecho acima:

- O `RestArea(aArea)` de hoje está **dentro** do `If nTipo == 1`. Quando a
  condição é falsa, a área não é restaurada. É inofensivo no uso atual, mas com o
  desvio novo vale mover o `RestArea` para fora, como no exemplo — assim há um
  único ponto de saída limpo.
- O fonte está em **ISO-8859 com CRLF**. Mantenha o encoding ao editar: salvar em
  UTF-8 corrompe os acentos das mensagens.

### Se o ajuste não for feito

A integração **não quebra**, mas fica pior de operar:

- `U_BJRETORNO` detecta o EP por `ExistBlock` e grava um `WARN` no log a cada
  ciclo, dizendo exatamente isto;
- o retorno pode travar na primeira importação (problema 1);
- ou os orçamentos chegam efetivados **com a mensagem marcada como erro**
  (problema 2), o que faz o monitor mostrar falha onde houve sucesso.

### Alternativa, se preferir não tocar no EP

Trocar a ordem: o `BJEfetiva` deixa de chamar `MATA416` e passa a **conferir** se
o `CK_NUMPV` foi preenchido pelo EP. Não recomendo — amarra a integração a um
Ponto de Entrada que pode ser desativado a qualquer momento, e o comportamento do
`MsgYesNo` em modo blind continua sendo dependente de versão.

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
quebrar o ciclo — TASK-023.

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
vem `01-000234`, `tabelaPrecoCodigo` vem `01-001`. Quem desmonta é o ERP, com
`U_BJSEMFIL` — ver TASK-043.

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

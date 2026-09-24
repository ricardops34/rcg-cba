# Integração Protheus → API BJ (Plataforma Comercial)

Integração AdvPL entre o Protheus e a API pública de integração da plataforma BJ
(`/api/v1/integracao/...`), documentada em `C:\VPS\rcg\docs\integração`.

Substitui, para a plataforma nova, o caminho do portal antigo
([`Portal/OnLine/OnLine.prw`](../OnLine/OnLine.prw) e [`rest/portal_erp.prw`](../../rest/portal_erp.prw)),
que postava lotes (`{"conteudo":[...]}`) lendo views `Online.dbo.*`. A API BJ é
REST por recurso — **um registro por chamada** —, então o desenho aqui é outro.

**Não cria tabela no dicionário de negócio.** O estado da integração mora em
duas tabelas próprias — `SZY` (mestre, marca d'água do lote) e `SZZ`
(detalhe, fila de mensagens) — e no console/log do AppServer via `FwLogMsg()`.
Cadastro de `SZY`/`SZZ`, campos e índices é feito pelo Configurador; nenhum
fonte cria ou altera dicionário.

> **Documento vigente é este README + [`PLANO.md`](PLANO.md)**, que cobre a
> integração inteira (os dois lados, entregue e pendente) e o histórico das
> decisões de arquitetura, datado.

---

## Fontes

Quatro fontes. A numeração segue a convenção do Protheus (prefixo de 4 +
número de 3):

### [`BJPLA002.prw`](BJPLA002.prw) — Funções

O que os outros três usam. Não depende de nenhum deles.

| Função | O que faz |
|---|---|
| `U_BJCATALO` | O catálogo: as 15 entidades, na ordem de carga que a API exige |
| `U_BJHTTP` | O cliente HTTP inteiro numa função: cabeçalho, verbo, execução, erro traduzido e retentativa. PATCH por `HTTPQuote`, o resto por `FWRest` |
| `U_BJCHAVE` | Parte uma `chave` nos campos do índice, já no tamanho do dicionário |
| `U_BJPARTES` | Separa uma `chave` pelo `-` **mantendo as partes vazias** (a filial de tabela compartilhada). Use no lugar de `StrTokArr` |
| `U_BJSEMFIL` | Retorno: converte a chave de integração devolvida pela plataforma (`01-000234`, `-000234`) no valor do ERP, sem filial e sem hífen, pelos campos da chave única. Aceita também a chave sem o prefixo de filial |
| `U_BJENFILA` | Põe a mensagem na SZZ: uma linha nova por registro coletado, com o lote e a sequência do momento. Não reaproveita nem sobrescreve linha — as janelas de coleta não se sobrepõem, então a mesma chave só volta se mudou de novo |
| `U_BJGRAVA` | Fecha a mensagem: status, HTTP, retorno e chave de destino. Não abre transação, de propósito |
| `U_BJACHOU` | A memória: essa chave já foi executada? Devolve o documento que ela gerou |
| `U_BJTEVE` | Essa chave já teve mensagem com tal verbo, em qualquer status? A coleta usa para mandar o `POST` antes do `DELETE` de um registro incluído e excluído entre duas coletas |
| `U_BJEXPURG` | **Agendável.** Apaga da SZZ as executadas mais velhas que `MV_BJAPI11`, e da SZY os lotes que ficaram sem nenhuma mensagem — menos o mais recente com marca. Nunca toca em pendente ou com erro |

### [`BJPLA003.prw`](BJPLA003.prw) — Coleta de saída

| Função | O que faz |
|---|---|
| `U_BJVARRE` | **Agendável.** Abre o lote na SZY, percorre o catálogo lendo por `S_T_A_M_P_`, enfileira e fecha o lote |
| `U_BJMAP*` | Os 15 mapeadores, um por entidade: regras de desconto, categorias, condições, armazéns, produtos, vendedores, clientes, fornecedores, tabelas de preço, estoque, notas de saída, XML das notas, notas de entrada, títulos e objetivos. **Orçamento (SCJ/SCK) não é enviado** — ver *SCJ e SCK fora da integração* |

### [`BJPLA004.prw`](BJPLA004.prw) — Envio e retorno

| Função | O que faz |
|---|---|
| `U_BJDRENA` | **Agendável.** Drena lote a lote: pega na SZY os lotes `1` e `3`, manda as mensagens de cada um e grava o resultado do envio no lote |
| `U_BJLOTE` | Envio em bloco por `PUT`, agrupado por entidade — caminho da carga inicial |
| `U_BJRETORNO` | **Agendável.** Lê da plataforma o que está aprovado, grava no ERP e confirma lá: orçamento aprovado → Pedido de Venda (SC5/SC6) por `MATA410`; alteração de cliente → SA1 por `CRMA980` |
| `U_BJEXPTOARQ` | Exporta as mensagens da SZZ de um lote em arquivo TXT e marca como executadas |
| `U_BJIMPDOARQ` | Importa um arquivo TXT da Plataforma BJ, grava lote SZY/SZZ de Entrada e executa a aplicação no ERP |

### [`BJPLA005.prw`](BJPLA005.prw) — Monitor (MVC)

| Função | O que faz |
|---|---|
| `U_BJPLA005` | A única tela. Browse dos lotes (SZY) com Gerar, Enviar, Receber, Mensagens, Enviar em Bloco, Exportar TXT, Importar TXT, Limpar e Ajuda |

**O agendamento chama a mesma função que o monitor.** Não existe uma camada
de rotinas agendáveis entre o Schedule e o trabalho: `U_BJVARRE`, `U_BJDRENA`,
`U_BJRETORNO` e `U_BJEXPURG` recebem parâmetro e são chamadas pelos dois lados.
Cada uma segura a própria trava — `LockByName`, que o servidor solta quando a thread termina, mesmo caindo com erro —, então
job e tela não se atropelam. O `SchedDef` fica no fonte onde a função mora.

**Cada fonte se lê sozinho.** A referência de escrita é o
[`Portal/OnLine/OnLine.prw`](../OnLine/OnLine.prw): o fluxo inteiro numa
sequência, sem vocabulário próprio para decorar antes de entender o código.
Uma função só existe quando tem lógica própria **e** serve mais de um chamador,
ou é uma operação completa e nomeada — um mapeador, o cliente HTTP, a gravação
da fila —, ou ainda é um bloco longo que de outro modo seria copiado em vários
pontos: **repetir lógica extensa é pior que dar um nome a ela**. O que continua
proibido é a função que envelopa uma nativa, renomeia uma operação conhecida ou
existe só para encurtar quem a chama. As regras estão em [`CLAUDE.md`](../../CLAUDE.md), seção
*Readability — sequential code, no private vocabulary*.

---

## Estrutura de dados: SZY (mestre) e SZZ (detalhe)

**SZY** é o cabeçalho: **um registro por lote** — cada chamada de `BJVARRE`
(varredura, cobrindo o catálogo inteiro ou uma entidade explícita) e cada
chamada de `BJRETORNO` geram uma linha nova, com início, fim, status e
contadores agregados daquela chamada. **SZZ** é o detalhe: uma linha por
mensagem, ligada ao lote que a gerou por `ZZ_CODIGO`. É mestre/detalhe no
sentido pleno — como cabeçalho e item de um documento Protheus (SF2/SD2):
cada chamada é uma instância nova do mestre, com seu próprio detalhe, não
uma linha de controle fixa reaproveitada para sempre. A SZY **não tem campo
de entidade** — uma chamada normal cobre várias entidades juntas (clientes,
produtos, vendedores, estoque etc. no mesmo lote), e quem identifica cada
mensagem é o `ZZ_ENTID`, no detalhe.

### SZY — mestre (um registro por lote)

| Campo | Tipo | Conteúdo |
|---|---|---|
| `ZY_FILIAL` | C(2) | Filial |
| `ZY_CODIGO` | C(9) | Código do lote — `MAX(ZY_CODIGO)+1` em SQL. Mesmo nome e mesmo valor que `ZZ_CODIGO`, na SZZ |
| `ZY_DTINI` / `ZY_HRINI` | D / C(8) | Quando o lote começou a trabalhar. Com o fim, mede quanto durou — **não tem relação com a janela de coleta**, que é a `ZY_MARCA` |
| `ZY_DTFIM` / `ZY_HRFIM` | D / C(8) | Quando o lote terminou de coletar. Com o início, é o tempo de trabalho do lote |
| `ZY_STATUS` | C(1) | **Diz qual lote ainda precisa ser processado.** `1` coletado, aguardando envio · `2` processado (coletado e enviado) · `3` erro. O envio percorre os `1` e os `3`, do mais antigo ao mais novo; o `2` está pronto e não volta. Não interfere na marca |
| `ZY_MARCA` | C(19) | **A marca do lote**: o corte até onde ele coletou, em UTC `AAAA-MM-DD HH:MM:SS`. É a referência para o início do próximo lote. Só é preenchida quando a coleta varreu o catálogo inteiro sem erro e não foi pontual — coleta por chave ou por intervalo de datas não move a janela |
| `ZY_QTDLIDO` | N(6) | Registros que os mapeadores devolveram, somados de todas as entidades do lote |
| `ZY_QTDENV` | N(6) | Registros enfileirados com sucesso, somados de todas as entidades do lote |
| `ZY_QTDERR` | N(6) | Erros de enfileiramento, somados de todas as entidades do lote |

Dois índices:

1. `ZY_FILIAL + ZY_CODIGO` — chave única, e a ordem de processamento: do lote
   mais antigo para o mais novo.
2. `ZY_FILIAL + ZY_STATUS + ZY_CODIGO` — para achar os lotes **com erro e os
   não processados** sem varrer os que já saíram. O status vem antes do código:
   o envio faz `dbSeek` por filial + status e lê só os lotes daquele status, na
   ordem do código.

**Consequência aceita:** como o status/marca valem para o lote inteiro, um
erro numa única entidade segura o avanço da marca de todas as outras do
mesmo lote, mesmo as que não tiveram erro nenhum. A próxima varredura de uma
entidade sem marca nova simplesmente alarga a janela de busca até achar o
último lote em que ela teve mensagem, sem duplicidade.

### SZZ — detalhe (uma linha por mensagem)

| Campo | Tipo | Conteúdo |
|---|---|---|
| `ZZ_FILIAL` | C(2) | Filial |
| `ZZ_CODIGO` | C(9) | `ZY_CODIGO` do lote (SZY) que gerou a mensagem. Na saída, o lote da varredura; na entrada, o lote de retorno aberto por `U_BJRETORNO` |
| `ZZ_SEQUEN` | C(9) | Sequência — a ordem de chegada, e a ordem de consumo |
| `ZZ_TIPO` | C(1) | `S` saída · `E` entrada |
| `ZZ_ENTID` | C(20) | Entidade do catálogo. 20 cabe o maior id: `orcamentos-pendentes` |
| `ZZ_CHVORI` | C(60) | **Chave de origem.** `chave` na saída, id da plataforma na entrada |
| `ZZ_VERBO` | C(6) | POST · PATCH · DELETE · GET · PUT |
| `ZZ_JSON` | Memo | O payload. Permite reenviar sem varrer a origem de novo |
| `ZZ_STATUS` | C(1) | `1` pendente · `2` executada · `3` erro |
| `ZZ_DTCRIA` / `ZZ_HRCRIA` | D / C(8) | Data/hora em que entrou na fila |
| `ZZ_DTEXEC` / `ZZ_HREXEC` | D / C(8) | Data/hora da última execução |
| `ZZ_HTTP` | N(3) | Código da última resposta |
| `ZZ_RETORN` | Memo | A resposta da API, íntegra — sucesso ou erro |
| `ZZ_CHVDES` | C(60) | **Chave de destino.** O documento gerado do outro lado na entrada; o id da plataforma na saída |

Dois índices:

1. `ZZ_FILIAL + ZZ_CODIGO + ZZ_SEQUEN` — **chave única.** É o detalhe do
   mestre: o lote amarra, a sequência ordena. É por ele que o envio percorre a
   fila e que `U_BJGRAVA` e o monitor chegam numa mensagem específica.
2. `ZZ_FILIAL + ZZ_CODIGO + ZZ_STATUS + ZZ_SEQUEN` — **para pegar as pendentes
   e as com erro** de um lote. O status vem antes da sequência: o envio faz
   `dbSeek` por filial + lote + status e cai direto na primeira pendente, sem
   ler as mensagens já executadas.

**O envio pega sempre as pendentes e as com erro, na ordem de código +
sequência.** Status `1` e `3` entram; `2` não volta. Lote a lote, do mais antigo
para o mais novo, e dentro de cada lote na ordem de chegada — que é a ordem de
carga que a API exige, com a pai antes da filha.

`ZZ_SEQUEN` e `ZY_CODIGO` numeram do mesmo jeito: `SELECT MAX(<campo>) FROM
<tabela> WHERE <FILIAL> = ? AND D_E_L_E_T_ = ' '`, incrementado com `Soma1()`,
dentro do próprio `RecLock`. Sem SXE, sem `GetSxeNum` — cada tabela numera
sozinha. Ver [`PLANO.md`](PLANO.md#6-estrutura-da-szy-mestre-e-da-szz-detalhe)
para o histórico da decisão (TASK-057).

---

## Parâmetros

Doze. Nenhum ajuste é constante no fonte — timeout, tentativas, pausas,
retenção e tamanho de bloco mudam por ambiente e se ajustam pelo Configurador,
sem recompilar.

| Parâmetro | Tipo | Padrão | Para quê |
|---|---|---|---|
| `MV_BJAPI01` | C | `https://api.rcgcba.bjsoft.com.br/api/v1` | URL base, já com o prefixo das rotas |
| `MV_BJAPI02` | C | — | Chave de API (`x-api-key`). Uma por empresa |
| `MV_BJAPI03` | C | `N` | Habilita a integração |
| `MV_BJAPI04` | N | `120` | Timeout da requisição, em segundos |
| `MV_BJAPI05` | N | `3` | Retentativas dentro da mesma requisição |
| `MV_BJAPI06` | N | `2000` | Espera entre retentativas, em ms — multiplicada pelo número da tentativa |
| `MV_BJAPI08` | N | `1050` | Pausa entre requisições, em ms |
| `MV_BJAPI09` | N | `1000` | Máximo de registros por `PUT` em bloco |
| `MV_BJAPI10` | N | `30` | Recuo da marca d'água, em dias, quando nenhum lote gravou marca e a fila de saída já tem mensagens. Com a fila vazia a coleta é carga inicial e lê a origem inteira |
| `MV_BJAPI11` | N | `90` | Retenção da mensagem executada, em dias |
| `MV_BJAPI12` | — | — | **Não é mais lido** desde 21/09/2026: as travas passaram de arquivo `.tsk` para `LockByName`. Pode ficar cadastrado, sem efeito |

Todos são lidos com valor padrão (`SuperGetMV`), então a integração sobe antes
de o SX6 estar completo — desligada (`MV_BJAPI03 = N`) até alguém ligar. Os
padrões acima são os mesmos valores que eram constantes no fonte até
17/09/2026, então um ambiente sem nenhum deles cadastrado se comporta como
antes. **Não há parâmetro de marca d'água**: ela mora na SZY, uma por lote.

> **Atenção ao `MV_BJAPI04`.** Esse nome já existiu no desenho antigo (`BJIN*`),
> onde guardava a marca d'água. Se sobrou na base, ele tem um conteúdo de data
> e precisa ser recadastrado como numérico antes do primeiro ciclo.

---

## Onde mora o estado

Nenhuma tabela de negócio nova — só `SZY` e `SZZ`.

| O que | Onde | Fonte |
|---|---|---|
| O que já foi enviado | `ZY_MARCA` na SZY, comparado com `S_T_A_M_P_` da origem | `BJPLA003` (`BJVARRE`) |
| Cada mensagem, pendente ou concluída | `SZZ` | `BJPLA002` |
| Um processo por vez | `LockByName` por empresa — um por rotina (`BJPLA_COLETA`, `BJPLA_ENVIO`, `BJPLA_RETORNO`, `BJPLA_EXPURGO`), um por entidade (`BJPLA_ENT_<id>`) na varredura e um por orçamento (`BJPLA_ORC_<id>`) no retorno. O servidor solta a trava quando a thread termina, então uma queda não deixa a rotina travada | `BJPLA002`, `BJPLA003`, `BJPLA004` |
| O que deu errado | `ZZ_RETORN` da própria mensagem (resposta íntegra da API) + console do AppServer via `FwLogMsg` | `BJPLA002` |
| Retorno já tratado | Fila da própria plataforma (`orcamentos-pendentes`/`clientes-alteracoes` só devolvem o que falta) + a mensagem executada na SZZ, com o documento em `ZZ_CHVDES` | `BJPLA004` |

Não há mais arquivo de log em disco (`erro-*.txt`) nem pasta de ciclo: tudo
que precisa sobreviver ao processo está na própria linha da SZZ ou no console.

**A SZY cresce uma linha por lote**, não uma linha por entidade: coleta de
hora em hora do catálogo inteiro é ~24 linhas/dia. Não há expurgo para a SZY
ainda — `U_BJEXPURG` continua limpando só a SZZ.

### A marca d'água

`ZY_MARCA` é a marca **do lote**: a hora até onde aquela coleta varreu. Cada
chamada de `BJVARRE` grava a sua e lê a do último lote que tem marca — é assim
que uma coleta sabe onde a anterior parou.

O ciclo, com horas de exemplo: a coleta das **10:00** varre da marca anterior
até 10:00, grava `ZY_MARCA = 10:00` e termina 10:30. A das **11:00** lê 10:00 e
varre (10:00, 11:00]. As janelas não se sobrepõem e não deixam buraco — o que
mudou entre 10:00 e 10:30, durante a própria varredura, entra na janela das
11:00. Por isso a marca é o **corte**, não o fim: gravasse 10:30, essa faixa
ficaria sem coletar para sempre.

Três regras seguram o desenho:

**A hora é lida antes do ciclo, não depois.** Marcar a hora do fim descartaria
em silêncio tudo que fosse alterado durante a varredura. Lendo antes, o pior
caso é reenviar no ciclo seguinte algo que já subiu.

**A hora vem do banco, não do AppServer.** O `S_T_A_M_P_` é escrito pelo
gatilho do DBAccess em **UTC**. Uma marca tirada de `Date()`/`Time()` ficaria
três horas adiantada no horário de Brasília.

**A marca só anda no lote completo e sem erro.** Coleta por chave ou por
intervalo de datas é ação dirigida e não a move; só uma chamada de `BJVARRE`
que varreu o catálogo inteiro e terminou sem nenhum erro grava `ZY_MARCA`.
**O envio não entra nessa conta**: mensagem que falhou continua pendente no
lote dela e é reenviada de lá, sem segurar a coleta seguinte.

### O que dispara a coleta em cada entidade

Todas as entidades são coletadas pela janela `(marca anterior, corte]` aplicada
ao `S_T_A_M_P_`. O que muda entre elas é **onde** esse carimbo é olhado:

| Entidade | Dispara por | Por quê |
|---|---|---|
| Notas de saída (SF2+SD2) e de entrada (SF1+SD1) | **Só o cabeçalho** — `SF2.S_T_A_M_P_` / `SF1.S_T_A_M_P_` | Nota é documento fechado: o que muda nela muda o cabeçalho. O `JOIN` traz todos os itens, então o payload sobe sempre completo |
| Tabelas de preço (DA0+DA1) | **Cabeçalho ou item** | Mexer no preço de um produto toca a DA1 e não encosta na DA0. Sem olhar o item, a alteração de preço não subiria |
| Regras de desconto (SZ0 cabeçalho + faixas) | **Cabeçalho ou faixa** | Mesma razão: a faixa tem carimbo próprio |
| As demais | O próprio registro | Tabela única, sem detalhe |

Nas duas que olham o detalhe, a janela inteira vale dos dois lados: o registro
entra se **cabeçalho ou detalhe mudou dentro da janela** — não antes, não
depois.

### A coluna `S_T_A_M_P_`

Mantida pelo DBAccess (20.1.1.0 ou superior) por gatilho, a cada inclusão ou
alteração. Não aparece na estrutura AdvPL da tabela — só em query. **Já existe
em todas as tabelas lidas pela integração** (por isso o `BJPLA006`, que a
criava, foi removido em 08/09/2026 — ver `PLANO.md`). Criar a coluna num
ambiente novo é responsabilidade do Configurador/DBA.

**Item não toca no cabeçalho.** Alterar um `SD2` não atualiza o `S_T_A_M_P_`
da `SF2`. Nas entidades que sobem cabeçalho e itens no mesmo payload — notas
(SF2+SD2), tabelas de preço (DA0+DA1) — o filtro é
`cabeçalho mudou OR existe item que mudou`.

O item continua dentro do payload do cabeçalho. Quando `D_E_L_E_T_` estiver
preenchido no item, ele leva `delete: true`; a API remove somente esse
`chave`. Itens ativos levam `delete: false` e são incluídos ou
atualizados.

---

## Catálogo de entidades

Ordem de carga documentada pela API — ela não aceita referência a registro
inexistente. Regra de desconto antes de categoria e produto; categoria antes
de produto; vendedor antes de cliente; produto antes de estoque.

| Entidade | Origem no ERP | Mapeador | Ativa no catálogo |
|---|---|---|---|
| regras-desconto | SZ0 | `U_BJMAPRGD` | ✅ |
| categorias | SZ1 | `U_BJMAPCAT` | ✅ |
| condicoes-pagto | SE4 | `U_BJMAPCND` | ✅ |
| armazens | NNR | `U_BJMAPARM` | ✅ |
| produtos | SB1 | `U_BJMAPPRD` | ✅ |
| vendedores | SA3 | `U_BJMAPVND` | ✅ |
| clientes | SA1 | `U_BJMAPCLI` | ✅ |
| fornecedores | SA2 | `U_BJMAPFOR` | ✅ |
| tabelas-preco | DA0+DA1 | `U_BJMAPTAB` | ✅ |
| estoque | SB2 | `U_BJMAPEST` | ✅ |
| objetivos | — | `U_BJMAPOBJ` | ❌ sem origem no Protheus padrão |
| notas-saida | SF2+SD2 | `U_BJMAPNFS` | ✅ |
| notas-saida-xml | SF2 (TSS) | `U_BJMAPXML` | ✅ |
| notas-entrada | SF1 | `U_BJMAPNFE` | ✅ |
| titulos-receber | SE1 | `U_BJMAPTIT` | ✅ |
| ~~orcamentos~~ | ~~SCJ+SCK~~ | ~~`U_BJMAPORC`~~ | ❌ removido em 21/09/2026 — ver *SCJ e SCK fora da integração* |

Duas entidades adicionais chegam **da** plataforma (não estão neste catálogo
porque não são varridas do ERP — nascem de um `GET`, ver `BJPLA004`):
`orcamentos-pendentes` e `clientes-alteracoes`.

> **Escopo da entrada, fechado em 17/09/2026:** o ERP recebe da plataforma
> **orçamento aprovado, cliente novo e alteração de cliente aprovada** — nada
> além disso. A inclusão de cliente novo ainda não está escrita (TASK-060): o
> código hoje só altera cliente que já existe na SA1, e a rota da plataforma
> para o cliente ainda não existe (TASK-051).

---

## Decisões de desenho

### PATCH não usa FWRest

`FWRest` implementa GET, POST e DELETE — **não implementa PATCH**. A API BJ
exige PATCH em toda atualização parcial, no saldo de estoque e no vínculo de
orçamento. Por isso `BJHTTP` (`BJPLA002.prw`) usa `HTTPQuote()` só para PATCH
e `FWRest` para o resto, nos dois ramos do mesmo `If` — a requisição inteira,
das duas formas, se lê numa função só.

### Gerar por grupo, não entidade a entidade

O **Gerar** do monitor escolhe um **grupo**, na ordem em que a carga precisa
acontecer (decisão de 22/09/2026): **Todos**, Cadastros, Financeiro, Estoque,
Notas de Saída, Notas de Entrada e, no fim, **Individual**. Os grupos estão em
`BJGrupos()`, no [`BJPLA005.prw`](BJPLA005.prw); cada um é a lista de
entidades que o compõe, e o `U_BJVARRE` varre a lista na ordem do catálogo,
que já é a ordem de dependência. "Todos" manda a lista vazia e varre o catálogo
ativo inteiro.

**Individual** é a única opção que pede a entidade e a única em que a chave vale
— é por ela que se reprocessa um registro específico.

### Hierarquia comercial: a SA3 aponta para ela mesma

O papel **não é marcado no cadastro**; sai de quem aponta para quem
(decisão de 22/09/2026, confirmada na base da RCG):

| Papel | Como é descoberto | Superior enviado |
|---|---|---|
| Gerente | o código aparece em algum `A3_GEREN` | nenhum |
| Supervisor | o código aparece em algum `A3_SUPER` e não é gerente | o `A3_GEREN` dele |
| Vendedor | os demais | o `A3_SUPER` dele |

O `BJCodsRef` levanta os dois conjuntos em duas consultas curtas, antes da
principal. A plataforma guarda **um** superior por vendedor e trata gerente e
supervisor como o mesmo papel — superior.

Quatro cuidados, todos nascidos de caso real:

1. **Autorreferência é ignorada.** Na RCG, o gerente `000315` tem
   `A3_SUPER = 000035` e o supervisor `000035` tem `A3_GEREN = 000315`: ler os
   dois campos para todo mundo fecharia um ciclo. Como o papel decide qual
   campo vale, a cadeia fica linear. Campo que aponta para o próprio código
   também não vale.
2. **O superior tem que existir na SA3**, e não estar excluído. Código órfão
   faria a API recusar o registro inteiro com 404; assim ele sobe sem superior,
   com aviso no log.
3. **Inativo também sobe, e também pode chefiar.** `A3_MSBLQL = 1` vira
   `ativo: false` e `desligado: true`, e o registro continua na plataforma —
   nota e título antigos apontam para ele. Ele conta no levantamento dos
   papéis como qualquer outro (decisão de 22/09/2026).
4. **A ordem de envio é por dependência, não por código.** Depois de coletar, o
   `BJOrdSup` emite em voltas: primeiro quem pode ir — sem superior, superior
   fora do lote (já está na plataforma) ou superior já emitido —, repetindo até
   não sobrar ninguém. Na prática: gerente, supervisor, vendedores.

**A fila guarda o JSON montado na coleta.** Corrigir o mapeador não conserta
mensagem que já está enfileirada: reenviar repete o mesmo corpo. Depois de
compilar, gere de novo — as mensagens antigas com erro saem no Limpar.

### POST como upsert e DELETE no mesmo fluxo

O mapeador seleciona alterações por `S_T_A_M_P_` sem filtrar `D_E_L_E_T_`.
Registro ativo gera `POST` (upsert); registro excluído gera `DELETE` com a
mesma chave. Não existe varredura independente de exclusões.

**O Gerar do monitor pergunta "Envia deletados?".** Em **Sim** vale o que
está descrito aqui, e é o que a coleta agendada faz. Em **Não** o filtro
`D_E_L_E_T_ = ' '` entra em todos os mapeadores, cabeçalho e item: a coleta
nem lê a linha excluída, e nenhum `DELETE` entra na fila. Serve para a carga
por datas, em que a marca preenchida faria a linha excluída subir.

**Incluído e excluído entre duas coletas: vão duas mensagens.** A coleta lê o
estado atual do registro, então um registro criado e apagado no intervalo
apareceria só como `DELETE`. Antes de enfileirar um `DELETE`, a coleta pergunta
ao `U_BJTEVE` se a chave já teve `POST` na fila, em qualquer status. Se não
teve, enfileira primeiro um `POST`, montado com os dados que a linha excluída
ainda guarda, e depois o `DELETE`. A plataforma recebe a inclusão e a exclusão,
nessa ordem (decisão de 22/09/2026). Um registro antigo cujas mensagens o
`U_BJEXPURG` já apagou também reenvia o `POST` antes do `DELETE`; isso custa só
uma requisição a mais.

### Cliente: PATCH não grava

`PATCH /integracao/clientes/{codigo}` **não altera o cadastro** — a mudança
entra na fila de aprovação interna da plataforma. O código lê `pendente` na
resposta e registra isso no log, para não parecer que a alteração foi
aplicada.

### Chave de integração e codigoErp

Todo registro vai com dois campos independentes — um nunca é calculado a partir
do outro (plano
[`2026-09-22-chave-integracao.md`](../../planos/2026-09-22-chave-integracao.md),
com a tabela completa de chaves):

| Campo | O que é | Exemplo |
|---|---|---|
| `chave` | **Chave de integração**: a chave única da tabela (X2_UNICO), campos na mesma ordem, `*_FILIAL` primeiro, `-` entre eles. A plataforma cadastra, atualiza, exclui e liga os registros por ela. Na tela: "Integração" | categoria `-12` (compartilhada) ou `01-12` (exclusiva); cliente `-000001-01` |
| `codigoErp` | Código no ERP, **só informativo**. Na tela: "Código". Cliente e fornecedor: COD+LOJA. Itens (DA1, SD2, SD1, SC6) não têm | `12`; cliente `00000101` |

As referências (`categoriaChave`, `clienteChave`...) são sempre a **chave** do
outro registro, com `FWxFilial(tabela) + "-" + ...`. Em tabela compartilhada a
filial fica em branco e a chave começa pelo hífen.

**Mestre e detalhe vão sempre juntos** (DA0/DA1, SF2/SD2, SF1/SD1 e, no
retorno, SC5/SC6), cada item com a própria `chave`. Os itens são lidos **sem
filtro de `D_E_L_E_T_`**, inclusive na carga inicial: o excluído vai com
`delete: true` e a plataforma o apaga. Com **Envia deletados? = Não** o item
excluído é cortado no `ON` do JOIN — no `WHERE` ele derrubaria junto o
cabeçalho que só tem itens excluídos.

**No retorno** a plataforma devolve as chaves (`clienteChave`, `produtoChave`...)
e o `U_BJSEMFIL` tira a filial e o hífen para chegar ao valor do ERP. Depois de
gerar o pedido, o `BJVincula` devolve a chave do SC5 e, para cada item do
orçamento, a do SC6 que o pedido gravou (casada pelo produto, na ordem do
`C6_ITEM`).

Na leitura, a filial é **sempre a primeira parte, mesmo vazia**. Por isso a
separação é feita com `U_BJPARTES`, nunca com `StrTokArr(..., "-")`, que
descarta a parte vazia. Com `StrTokArr`, `-000001-01` virava duas partes em vez
de três, o `U_BJCHAVE` recusava a chave e o pedido não achava o cliente
(corrigido em 22/09/2026).

### Chave do cliente

A API tem uma chave só; o Protheus tem `A1_COD` + `A1_LOJA`. A `chave` enviada
é `A1_FILIAL-A1_COD-A1_LOJA`.

### Chave dos transacionais


É a composição dos campos naturais da tabela, incluindo `*_FILIAL`.
`R_E_C_N_O_` não participa da integração.

### SCJ e SCK fora da integração

**Decisão de 21/09/2026: a integração não envia nem recebe SCJ/SCK.** O
Orçamento do ERP não participa em nenhum dos dois sentidos:

- **Saída:** a entidade `orcamentos` saiu do catálogo (`U_BJCATALO`) e o
  mapeador `U_BJMAPORC` foi removido do `BJPLA003`. Orçamento criado no ERP
  não sobe para a plataforma.
- **Entrada:** o orçamento aprovado na plataforma nunca grava SCJ/SCK — vira
  Pedido de Venda (SC5/SC6) direto, como descrito abaixo.

Os orçamentos nascem e são aprovados na plataforma; o ERP só recebe o pedido
que resulta deles.

### Orçamento da plataforma vira Pedido sem passar pelo Orçamento do ERP

O orçamento aprovado na plataforma vira **Pedido de Venda direto** — SC5/SC6
por `MATA410`. Não passa pelo Orçamento do ERP: a aprovação já aconteceu do
outro lado, e o orçamento intermediário só acrescentaria um documento para
efetivar depois. Quatro passos:

1. `GET /integracao/orcamentos/pendentes` lista os aprovados sem `chave`.
2. Consulta a fila: mensagem de entrada já executada para esse id significa que
   o pedido existe e falta só reenviar o aviso do passo 4.
3. `Begin Transaction`: `MATA410` grava SC5/SC6 **e** a mensagem passa a
   executada com o número do pedido, juntos.
4. `PATCH /integracao/orcamentos/pendentes/{id}` grava a `chave` do pedido.

**A garantia contra pedido duplicado está inteira no passo 3.** Se a gravação
da mensagem sair de dentro do `Begin Transaction`, volta a existir o intervalo
em que o pedido está na SC5 e a plataforma não sabe — e o ciclo seguinte cria
um segundo pedido do mesmo orçamento.

### Alteração de cliente: CRMA980

Usa o **CRMA980**, que substituiu o `MATA030` descontinuado pela TOTVS. A
lista de campos que voltam da plataforma já é a lista branca do que pode ser
alterado.

### Idempotência dos retornos

Quem garante que um orçamento não vire dois pedidos é a **fila da
plataforma** mais a fila local: `/orcamentos/pendentes` só devolve o que ainda
não tem `codigoLegado`, e o PATCH de vínculo o tira da lista. Se a rede cair
entre gravar o pedido e o PATCH, o orçamento volta na próxima leitura — e aí a
mensagem executada na SZZ responde que o pedido já existe, com o número dele em
`ZZ_CHVDES`. Vale o mesmo para alteração de cliente, com o `PATCH .../aplicada`.

### Exclusões

Cada mapeador lê `D_E_L_E_T_` sem usá-lo como filtro. Valor em branco gera
POST (upsert); preenchido gera DELETE com a mesma `chave`. As duas exceções,
em que o filtro volta e nada excluído sai da origem: a carga inicial e o
**Envia deletados? = Não** do Gerar.

Não há registro do que já foi enviado antes, então um `DELETE` pode chegar
para uma chave que a plataforma nunca conheceu. A API responde **404** e o
evento conta como resolvido: o objetivo era que o registro não estivesse lá,
e não está.

Tabela sem `S_T_A_M_P_` não participa da varredura incremental.

**Purge físico não é detectado.** Registro removido fisicamente do banco
(reccar, reindexação com purge) não aparece nem na varredura de envio nem na
de exclusão — precisa ser disparado manualmente pelo monitor.

---

## Limite de requisições — leia antes da primeira carga

A API limita **60 req/min nas rotas de integração** e **120 req/min no envio
de XML**, contados **por IP de origem, não por chave**. Com um registro por
chamada, isso é o fator que dita a duração da carga:

| Volume | Tempo aproximado (individual) |
|---|---|
| 1.000 registros | ~17 min |
| 5.000 registros | ~1h25 |
| 20.000 registros | ~5h40 |

`MV_BJAPI08` (1050 ms por padrão) mantém o ritmo logo abaixo do
teto. Reduzir esse valor não acelera a carga: passa a render 429, retentativa
e espera progressiva — mais lento no total. Para a carga inicial, use o
botão **Enviar em Bloco** do monitor: agrupa até `MV_BJAPI09` pendentes por
`PUT` (1.000 por padrão), sob o mesmo
teto de requisições — ~14 min para 5.000 registros em vez de ~1h25.

Consequências práticas:

- A **carga inicial** deve ser planejada como uma janela longa, fora do
  horário comercial, entidade por entidade (o Lote respeita a ordem do
  catálogo).
- O **regime permanente** é confortável: só o que mudou vira requisição.
- Se dois processos do Protheus (ou o portal antigo) saírem pelo mesmo IP,
  dividem o mesmo balde.

---

## Instalação

1. Compile os quatro fontes (`BJPLA002` a `BJPLA005`).
2. **Cadastre `SZY` e `SZZ`** no Configurador — campos, tipos e índices
   conforme a seção "Estrutura de dados" acima. Nenhum fonte cria dicionário.
3. Confirme que as tabelas de origem do catálogo (SA1, SB1, SF2, SE1 etc.)
   têm a coluna `S_T_A_M_P_` — responsabilidade do DBA/Configurador
   (`TCConfig('SETUSEROWSTAMP = ON')` / `SETAUTOSTAMP = ON`, DBAccess
   20.1.1.0+). Tabela sem a coluna é lida inteira a cada ciclo.
4. **Cadastre os parâmetros** `MV_BJAPI01` a `MV_BJAPI12` — no Configurador,
   ou distribuídos por UPDDISTR. Todos têm valor padrão, então a integração
   sobe mesmo sem cadastro explícito (desligada, por `MV_BJAPI03 = N`).
5. Preencha `MV_BJAPI02` com a chave de API (`itg_...`), obtida em
   *Administração > Integração* na plataforma. A chave carrega a empresa —
   uma chave por empresa do Protheus.
6. Ligue `MV_BJAPI03 = S`.
7. Cadastre a rotina do monitor no menu, apontando para `U_BJPLA005`.
8. Cadastre os quatro agendamentos em
   *Configurador > Ambiente > Schedule > Agendamentos*, apontando para
   `U_BJVARRE` (coleta), `U_BJDRENA` (envio), `U_BJRETORNO` (retorno) e
   `U_BJEXPURG` (expurgo) — as mesmas funções que o monitor chama. Cada fonte
   tem `SchedDef`, então elas aparecem como agendáveis; nenhuma recebe
   parâmetro pelo Schedule. Empresa e filial saem da própria tela do
   agendamento. **Uma chave de API por empresa, logo um conjunto de
   agendamentos por empresa.**

| Rotina | O que faz | Ritmo sugerido |
|---|---|---|
| `U_BJVARRE` | Coleta e enfileira na SZZ | de hora em hora |
| `U_BJDRENA` | Drena a fila e executa as requisições | a cada poucos minutos |
| `U_BJRETORNO` | Orçamento aprovado → Pedido; alteração de cliente → SA1 | de hora em hora |
| `U_BJEXPURG` | Apaga executadas acima de `MV_BJAPI11` | 1× por dia, fora do horário comercial |

**O intervalo do JOB define a frequência, não a janela** (decisão de
22/09/2026). A coleta agendada vai sem entidade, sem chave e sem datas: varre
o catálogo ativo da `ZY_MARCA` do último lote válido até o instante em que
começou. Se uma execução falhar, ou o servidor ficar parado a noite inteira, a
marca não avança e a execução seguinte cobre o intervalo acumulado — mudar o
intervalo muda só a latência entre a alteração no ERP e a chegada na
plataforma.

O que costuma impedir o JOB de rodar: `MV_BJAPI03` diferente de `S`, o serviço
de Schedule fora do ar no `appserver.ini`, ou uma coleta já em andamento — cada
rotina segura a própria trava (`LockByName`) e a chamada repetida é ignorada
com aviso no log.

**Primeira carga:** enquanto a fila não tiver nenhuma mensagem de saída (SZZ
vazia, `ZZ_TIPO = "S"`), a coleta é **carga inicial**: a marca fica vazia e os
mapeadores leem a origem inteira, **sem os registros excluídos** (nem cabeçalho
nem item) — o que nunca chegou à plataforma não vira `DELETE`. Basta rodar **Gerar** com o grupo **Todos**,
sem chave nem datas, e depois **Enviar em Bloco**. A ordem de carga é a do
catálogo, e os grupos (Cadastros, Financeiro, Estoque, Notas) permitem fazer
por partes. Terminando sem erro, o lote grava a marca e as próximas
coletas passam a ser incrementais. Se a fila já tem mensagens e nenhum lote
gravou marca ainda, a marca recua `MV_BJAPI10` (30 dias por padrão).

**Nenhum campo customizado é necessário** na SC5/SC6: o vínculo com a
plataforma mora na fila (`ZZ_CHVORI` guarda o id de lá, `ZZ_CHVDES` o número do
pedido daqui).

---

## Monitor (`U_BJPLA005`)

O monitor é **MVC padrão** sobre a **SZY**: `FWmBrowse` no browse,
`ModelDef`/`ViewDef` com o lote como mestre e as mensagens (SZZ) como detalhe,
amarradas por `ZZ_CODIGO`. As colunas vêm do dicionário — títulos, pictures e o
combo do `ZY_STATUS` —, e a linha é colorida pela legenda:

| Cor | `ZY_STATUS` |
|---|---|
| Amarelo | `1` coletado, aguardando envio |
| Verde | `2` processado |
| Vermelho | `3` erro |

**Visualizar** abre o lote com a lista de mensagens dele. As ações da integração
ficam no mesmo menu, e operam sobre o lote posicionado:

| Opção | O que faz |
|---|---|
| **Gerar** | Pede entidade (ou "Todas as entidades ativas"), opcionalmente chave ou intervalo de datas, e **Envia deletados?** (`ParamBox`); roda a coleta com esses parâmetros e cria um lote novo |
| **Enviar** | Drena só as mensagens do lote posicionado na lista. Sem lote posicionado, o agendamento de envio percorre os lotes `1` e `3`, do mais antigo ao mais novo |
| **Receber** | Pergunta na plataforma se há orçamentos aprovados ou alterações de cliente; se houver, grava um lote e já aplica no ERP, confirmando o status lá — tudo numa chamada |
| **Mensagens** | Lista as mensagens do lote posicionado (SZZ) e abre a escolhida, com payload e resposta |
| **Enviar em Bloco** | Envia tudo que está pendente em blocos de até `MV_BJAPI09`, por `PUT` — caminho da carga inicial. Não confundir com "lote" (SZY): isto é o envio em lote da API |
| **Limpar** | Roda o expurgo agora (mensagens executadas mais antigas que `MV_BJAPI11`, 90 dias por padrão). Não expurga lotes (SZY) — ainda sem rotina para isso |
| **Ajuda** | Explica como a integração decide o que enviar |

Para reprocessar um período, use **Gerar** informando o intervalo de datas: a
coleta pontual não mexe na marca d'água dos ciclos automáticos.

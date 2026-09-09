# Integração Protheus ↔ Plataforma BJ — os fontes AdvPL

Os cinco fontes `BJPLA*` desta pasta são o lado ERP da integração com a API da
plataforma BJ (`/api/v1/integracao/...`). Este README descreve **o que está aqui
e como está**; o desenho completo, com decisões, tarefas e o que falta dos dois
lados, é o [`PLANO.md`](PLANO.md).

> **Estado em 09/09/2026: escritos, nenhum compilado.** Não há base instalada,
> marca d'água em uso nem dado na plataforma vindo desta integração — a estrutura
> começa do zero. O `BJPLA004` (retorno) está escrito e **não funciona**: a ida e
> volta da chave nunca fechou (TASK-043 no plano).

> **Os onze fontes `BJIN*` foram aposentados em 08/09/2026** e não estão nesta
> pasta. Nada da estrutura anterior vale como instrução — em especial o
> `U_BJIN999()`, o agendamento da rotina `BJIN900` e o parâmetro `MV_BJAPI04`,
> que não existem mais.

---

## A integração em uma página

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

**A fila (SZZ) é o centro, e é o que separa esta versão da anterior.** Antes, quem
detectava a mudança era quem fazia o HTTP, e o resultado só existia enquanto
aquele laço rodava — daí nasciam a marca d'água que não podia avançar, os
arquivos de erro em disco e a contagem estimada do monitor. Agora toda mensagem,
de ida e de volta, é gravada antes de ser processada, e cada um daqueles
controles paralelos deixou de existir.

**Detectar e enviar são agendamentos separados**, porque têm ritmos diferentes:
varrer SB1/SA1/SF2 é caro e não precisa ser frequente; drenar é limitado pelo teto
da API (60 req/min por IP). Juntos, uma carga grande bloquearia a próxima
varredura.

---

## Os fontes

| Fonte | O que faz |
|---|---|
| [`BJPLA001.prw`](BJPLA001.prw) | As quatro rotinas agendáveis, cada uma com seu `SchedDef` — é o que se cadastra no Schedule |
| [`BJPLA002.prw`](BJPLA002.prw) | Base de todos: catálogo das entidades, cliente HTTP, fila (SZZ), filtro de `S_T_A_M_P_`, marca d'água, expurgo. Não depende de nenhum outro |
| [`BJPLA003.prw`](BJPLA003.prw) | Saída: os dezesseis mapeadores, a varredura que enfileira e a drenagem que envia |
| [`BJPLA004.prw`](BJPLA004.prw) | Entrada: orçamento da plataforma → SCJ pelo `MATA415`; alteração de cliente → SA1 |
| [`BJPLA005.prw`](BJPLA005.prw) | Monitor da fila, em `FWMBrowse` sobre a SZZ |

As funções acompanham o fonte pelo prefixo: `U_BJMAPPRD` é o mapeador de
produtos, em `BJPLA003`; `U_BJENFILA` põe na fila, em `BJPLA002`.

> **Não há sexto fonte.** O `BJPLA006` existiu e foi removido em 08/09/2026: as
> colunas `S_T_A_M_P_` já estão no banco desta base, e criar coluna em tempo de
> execução é proibido. A preparação de ambiente não tem rotina — é conferência, e
> está em *Instalação*.

> **`BJPLA.CH` também não existe.** O include comum foi previsto e não feito: cada
> fonte repete os `#Define` de que precisa, porque diretiva de pré-processador não
> atravessa fonte. O custo assumido é mudar um status em cinco lugares.

---

## As quatro rotinas agendáveis

Cada uma se cadastra separadamente em *Configurador > Ambiente > Schedule >
Agendamentos*. Empresa e filial saem da própria tela do agendamento, e **cada
empresa tem a sua chave de API** — logo, um conjunto de agendamentos por empresa.

| Rotina | Papel | Ritmo sugerido |
|---|---|---|
| `U_BJPLA001` | **Coleta** — varre as tabelas por `S_T_A_M_P_` e enfileira. Não envia nada | de hora em hora |
| `U_BJPLA01E` | **Envio** — drena a fila de saída e executa as requisições | contínuo, ou a cada poucos minutos |
| `U_BJPLA01R` | **Retorno** — lê a plataforma, aplica no ERP e confirma lá | de hora em hora |
| `U_BJPLA01X` | **Expurgo** — apaga da fila as mensagens executadas antigas | uma vez por dia, fora do horário comercial |

Cada rotina tem o seu semáforo em arquivo (`\bjapi\<empresa>\bjpla-*.tsk`): se o
arquivo existe, outro job igual já está rodando e a execução simplesmente
retorna. A varredura tem ainda um semáforo por entidade, e o retorno um por
orçamento.

**Terminada a varredura de uma entidade, a marca d'água dela já avança** — o que
precisa ir está guardado na SZZ e não depende mais da origem. Era exatamente isso
que a estrutura anterior não conseguia fazer: um erro em qualquer entidade
congelava a marca de todas.

---

## Onde mora o estado

| O que | Onde |
|---|---|
| A mensagem, o payload e a resposta | **SZZ**, uma linha por mensagem (`ZZ_JSON`, `ZZ_RETORN`, `ZZ_HTTP`) |
| O que já foi coletado | `ZZ_MARCA`, na linha de controle da entidade, comparada com o `S_T_A_M_P_` da origem |
| Um processo por vez | Arquivo `.tsk` em `\bjapi\<empresa>\` |
| O que aconteceu em cada execução | `FwLogMsg` — console e log do AppServer |

Não há mais arquivo de erro em disco: o payload e a resposta íntegra ficam na
própria mensagem, e é de lá que o monitor lê. A estrutura da SZZ, campo a campo,
e os quatro índices estão na [seção 6 do plano](PLANO.md#6-estrutura-da-szz).

**`ZZ_SEQUEN` precisa de cadastro no SXE.** A numeração sai de
`GetSxeNum("SZZ", "ZZ_SEQUEN")`; sem ela, dois jobs que enfileirem ao mesmo tempo
— a coleta e o retorno rodam em agendamentos separados — receberiam a mesma
sequência.

### A marca d'água

Cada entidade tem **uma** linha de controle na própria fila: `ZZ_CHVORI =
"*CONTROLE*"`, status executada, `ZZ_MARCA` com a hora UTC no formato
`AAAA-MM-DD HH:MM:SS`. O expurgo nunca a apaga — apagada, a entidade recuaria 30
dias na varredura seguinte.

> A [seção 6 do plano](PLANO.md#6-estrutura-da-szz) chama essa linha de `*MARCA*`.
> O valor que os fontes gravam e leem é `*CONTROLE*` (`BJPLA002`, `BJPLA003` e
> `BJPLA005`) — quem manda é o código.

**A hora vem do banco, em UTC**, porque o `S_T_A_M_P_` é escrito pelo gatilho do
DBAccess em UTC. Uma marca tirada de `Date()`/`Time()` ficaria três horas
adiantada no horário de Brasília, e tudo que mudasse nesse intervalo sairia da
varredura.

### A coluna `S_T_A_M_P_`

Mantida pelo DBAccess (20.1.1.0 ou superior) por gatilho, a cada inclusão ou
alteração. Não aparece na estrutura AdvPL da tabela — só em query.

**Item não toca no cabeçalho.** Alterar um `SD2` não atualiza o `S_T_A_M_P_` da
`SF2`. Nas entidades que sobem cabeçalho e itens no mesmo payload — notas
(SF2+SD2), tabelas de preço (DA0+DA1), orçamentos (SCJ+SCK), regras de desconto
(SZ0 + faixas) — o filtro é `cabeçalho mudou OR existe item que mudou`.

Item excluído (`D_E_L_E_T_`) continua dentro do payload do cabeçalho, com
`delete: true`; a API remove somente aquele `codigoErp`.

---

## O catálogo das entidades

A ordem do array em `U_BJCATALO()` **é** a ordem de carga, e a API a exige: ela
não aceita referência a registro inexistente. Regra de desconto antes de
categoria e produto; categoria antes de produto; vendedor antes de cliente;
produto antes de estoque; fornecedor antes de nota de entrada.

| # | Entidade | Origem | Mapeador | Ativa |
|---|---|---|---|---|
| 1 | regras-desconto | SZ0 | `U_BJMAPRGD` | ✅ |
| 2 | categorias | SZ1 + SBM | `U_BJMAPCAT` | ✅ |
| 3 | condicoes-pagto | SE4 | `U_BJMAPCND` | ✅ |
| 4 | armazens | NNR | `U_BJMAPARM` | ✅ |
| 5 | produtos | SB1 | `U_BJMAPPRD` | ✅ |
| 6 | vendedores | SA3 | `U_BJMAPVND` | ✅ |
| 7 | clientes | SA1 | `U_BJMAPCLI` | ✅ |
| 8 | fornecedores | SA2 | `U_BJMAPFOR` | ✅ |
| 9 | tabelas-preco | DA0 + DA1 | `U_BJMAPTAB` | ✅ |
| 10 | estoque | SB2 | `U_BJMAPEST` | ✅ |
| 11 | objetivos | — | `U_BJMAPOBJ` | ❌ inativa |
| 12 | notas-saida | SF2 + SD2 | `U_BJMAPNFS` | ✅ |
| 13 | notas-saida-xml | SF2 → TSS | `U_BJMAPXML` | ✅ |
| 14 | notas-entrada | SF1 + SD1 | `U_BJMAPNFE` | ✅ |
| 15 | titulos-receber | SE1 | `U_BJMAPTIT` | ✅ |
| 16 | orcamentos | SCJ + SCK | `U_BJMAPORC` | ✅ |

Duas observações que não cabem na tabela:

- **Categorias têm duas origens.** A coluna de alias do catálogo traz a SZ1 porque
  é ela que governa a marca d'água da entidade; o mapeador lê a SZ1 e a SBM.
- **Objetivos nascem inativos.** O Protheus padrão não tem meta por vendedor/mês
  nesta base, e o mapeador é um esqueleto. Quando a origem existir, a leitura
  entra no próprio `U_BJMAPOBJ`.

---

## Parâmetros

Três, e só. O resto é constante no fonte: timeout, tentativas, pausas entre
requisições, prazo de retenção e pasta de trabalho não mudam por ambiente — e as
pausas em particular derivam do teto da API, então baixá-las só rende `429`.

| Parâmetro | Tipo | Padrão | Para quê |
|---|---|---|---|
| `MV_BJAPI01` | C | `https://api.rcgcba.bjsoft.com.br/api/v1` | URL base, já com o prefixo das rotas |
| `MV_BJAPI02` | C | — | Chave de API (`x-api-key`). Uma por empresa |
| `MV_BJAPI03` | C | `N` | Habilita a integração |

Todos são lidos com valor padrão, então a integração sobe antes de o SX6 estar
completo. **`MV_BJAPI04` saiu**: a marca d'água mora na fila, e não havia mais o
que gravar num parâmetro.

Nenhum fonte grava no SX6, e nenhum consulta SX2/SXE/SX6 diretamente — a proibição
de acessar dicionários em AdvPL é do projeto, e o cadastro e a conferência são
feitos pelo Configurador.

---

## Instalação

1. **Crie a SZZ no dicionário** — campos e os quatro índices da
   [seção 6 do plano](PLANO.md#6-estrutura-da-szz) — e o cadastro de `ZZ_SEQUEN`
   no SXE.
2. **Cadastre `MV_BJAPI01`, `MV_BJAPI02` e `MV_BJAPI03`** no Configurador ou por
   UPDDISTR. A chave de API sai de *Administração > Integração* na plataforma e
   carrega a empresa.
3. **Confira a coluna `S_T_A_M_P_`** nas tabelas do catálogo — incluindo SZ1, SA2,
   SF1 e SD1. Nesta base elas já existem, e é por isso que não há rotina de
   preparação: alterar schema em tempo de execução é proibido. Faltando em alguma
   tabela, quem resolve é o DBA, fora da integração.
4. Compile os cinco fontes.
5. Ligue `MV_BJAPI03` = `S`.
6. Cadastre a rotina do monitor no menu, apontando para `U_BJPLA005`.
7. Cadastre os quatro agendamentos, um para cada rotina de `BJPLA001`, por
   empresa.

**Primeira carga.** Sem linha de controle, a marca recua 30 dias
(`BJ_DIAS_INICIAL`) e a primeira varredura enfileira tudo que mudou no período.
Para carregar a base inteira, ajuste o horário de corte pelo monitor e acompanhe
— respeitando a ordem do catálogo, que a API exige. Planeje como janela longa: o
teto de 60 req/min é o que dita a duração.

| Volume | Tempo aproximado |
|---|---|
| 1.000 registros | ~17 min |
| 5.000 registros | ~1h25 |
| 20.000 registros | ~5h40 |

`BJ_PAUSA_REQ` (1050 ms) mantém o ritmo logo abaixo do teto. Reduzir não acelera:
rende 429, retentativa e espera progressiva — mais lento no total. O limite é
contado **por IP de origem, não por chave**, então dois processos do Protheus
saindo pelo mesmo IP dividem o mesmo balde.

---

## Decisões de desenho

### PATCH não usa FWRest

`FWRest` implementa GET, POST, PUT e DELETE — **não implementa PATCH**. A API
exige PATCH em toda atualização parcial, no saldo de estoque e no vínculo de
orçamento. Por isso `U_BJHTTP` usa `HTTPQuote()` só para PATCH e `FWRest` para o
resto, atrás da mesma assinatura.

### POST como upsert, e DELETE no mesmo fluxo

O mapeador seleciona alterações por `S_T_A_M_P_` sem filtrar `D_E_L_E_T_`.
Registro ativo gera `POST` (a API trata como upsert); registro excluído gera
`DELETE` com a mesma chave. Não existe varredura independente de exclusões.

Um `DELETE` pode chegar para uma chave que a plataforma nunca conheceu: a API
responde **404** e o evento conta como resolvido — o objetivo era que o registro
não estivesse lá, e não está.

**Purge físico não aparece em varredura nenhuma.** Removida a linha do banco, só
o reenvio dirigido pelo monitor resolve.

### Mensagem pendente é substituída, não acumulada

Se o produto mudou três vezes antes de a fila drenar, o que a plataforma precisa
receber é o estado final — três POST idênticos seriam três requisições gastas no
mesmo balde. O histórico do que mudou no meio está na tabela de origem. Falta
ratificar essa escolha, porque é ela que também zera o `ZZ_TENTAT`
(decisão 1 da [seção 13](PLANO.md#13-decisões-em-aberto)).

### Cliente: PATCH não grava

`PATCH /integracao/clientes/{codigo}` **não altera o cadastro** — a mudança entra
na fila de aprovação interna da plataforma. O ERP lê `pendente` na resposta e
registra isso, para não parecer que a alteração foi aplicada.

### Entrada: o orçamento passa pelo Orçamento do ERP

O orçamento aprovado na plataforma **não vai direto para o `MATA410`**: entra
como Orçamento (SCJ/SCK) pelo `MATA415` e é efetivado em seguida pelo `MATA416`,
o mesmo caminho da opção *Aprovar* do browse. Todo orçamento recebido é
efetivado — a aprovação já aconteceu do lado da plataforma, e repeti-la no ERP
seria pedir duas vezes a mesma decisão.

Isso dá dois vínculos nativos, **sem criar campo nenhum**:

| Campo | Guarda |
|---|---|
| `CJ_NUMEXT` C(36) | o id da plataforma, que cabe inteiro num UUID |
| `CK_NUMPV` C(6) | o pedido, gravado pelo próprio `MATA416` na efetivação |

O antigo `C5_XBJORC` não é mais usado.

### Idempotência do retorno

Quem garante que um orçamento não vire dois documentos é a ordem dos passos: a
fila local é consultada **antes de tudo** (mensagem de entrada já executada
significa documento já gerado, e falta só reenviar o aviso), a SCJ por
`CJ_NUMEXT` é a segunda linha de defesa — e responde mesmo depois de a fila ser
expurgada —, e a gravação do `MATA415` acontece dentro de um `Begin Transaction`
**junto** com a marcação da mensagem.

> **A garantia inteira depende disso.** Se a marcação sair de dentro do
> `Begin Transaction`, a fresta reabre sem nenhum sintoma visível: volta a existir
> o intervalo em que o documento está na SCJ e a plataforma não sabe, e o ciclo
> seguinte gera um segundo.

### A chave

A API tem uma chave só; o Protheus tem `A1_COD` + `A1_LOJA`. O `codigoErp` é a
composição dos campos naturais da tabela, incluindo o de filial, separados por
`-`. `R_E_C_N_O_` não participa. `U_BJCHAVE` faz o caminho de volta — da chave
para as partes, já no tamanho do dicionário — e recusa chave malformada em vez de
devolver as partes deslocadas uma casa. A definição completa está na
[seção 3 do plano](PLANO.md#3-a-chave-codigoerp).

---

## Monitor (`U_BJPLA005`)

`FWMBrowse` sobre a SZZ, com cor por status (amarelo pendente, vermelho erro,
verde concluída) e filtro padrão no que exige ação — a linha de controle das
entidades fica de fora da lista.

| Operação | O que faz |
|---|---|
| **Coletar (Parâmetros)** | Varredura manual, por entidade e chave |
| **Visualizar Payload / Log** | O JSON enviado e a resposta ou o erro da API, da mensagem selecionada |
| **Enviar (Parâmetros)** | Drena a fila, com limite de mensagens |
| **Retorno (Orçamentos)** | Lê a plataforma e aplica no ERP |
| **Reprocessar Erro** | Devolve a mensagem com falha para pendente |
| **Painel de Resumo** | Situação por entidade: marca em vigor e o que está pendente |
| **Horário de Corte** | Ajusta a marca d'água da entidade — recuar reprocessa um período |

O monitor abre com a integração desligada (`MV_BJAPI03 = N`), perguntando antes:
é justamente quando se quer olhar a fila.

---

## O que ainda não funciona

| Ponto | Situação |
|---|---|
| **Retorno (`BJPLA004`)** | Escrito, **não funciona** — a ida e volta da chave nunca fechou (TASK-043) |
| **Reenvio dirigido** | Pelo monitor, nenhum mapeador acha o registro hoje (TEST-012) |
| **Alteração de cliente** | `BJ_ROTA_ALTCLI` (`/integracao/clientes/alteracoes`) ainda não existe na API. O fonte registra o 404 e não quebra o ciclo (TASK-051) |
| **Objetivos de venda** | Sem origem no ERP; entidade inativa e mapeador esqueleto |
| **`regraDescontoCodigo` nos itens** | Sem campo confirmado na SB1, DA1, SD2 ou SCK deste dicionário. Vai `null` |
| **XML da nota** | Manda `xmlBase64` seguindo o `endpoints.md`; **415** no primeiro envio significa que o caminho é multipart, que o `FWRest` não monta sozinho |
| **Rota do estoque** | O envio usa `/estoque/{codigoErp}`, que é a rota real; a "Visão geral" do `endpoints.md` ainda mostra a de dois segmentos (TASK-050) |

---

## Padrão de escrita destes fontes

Vigente desde 08/09/2026: **AdvPL legível para quem mantém Protheus** — fluxo
explícito, nomes pela finalidade, mapeamentos visíveis e uso direto das funções
nativas.

**É proibido criar wrapper para operação nativa.** Arquivo (`File()`,
`MemoWrite()`, `FErase()`, `MakeDir()`), string, array, condicional e conversão
básica são chamados no ponto de origem. Função auxiliar só existe quando
representa uma operação real do domínio — o teste é o TEST-010 do plano: se
apagar a função e colar o corpo em cada chamada deixasse o código igual ou mais
claro, a função sobra e tem de sair.

Também não se acessa dicionário direto (SX2, SXE, SX6): consultas e operações
usam APIs do framework; cadastro e conferência ficam no Configurador. As
referências de estilo são `IMPPED.prw`, `SINCMAX.prw` e `FuncXMaxima.prw`.

Conformidade verificada em 08/09/2026: nenhum `IIF`, `ConOut`, `Function` pública,
`cFilial`, `FwFreeObj` ou driver ISAM; `FWExecStatement` parametrizado em toda
query; fontes em ASCII puro. As diretrizes completas e os critérios de revisão
estão no [plano](PLANO.md#diretriz-de-legibilidade-proibição-estrita-de-funções-wrapper--08092026).

---

## Documentos vizinhos

| Documento | Papel |
|---|---|
| [`PLANO.md`](PLANO.md) | O plano da integração inteira: estado, decisões, tarefas, o que falta |
| [`../README.md`](../README.md) | Contrato da API: autenticação, tenant, upsert, erros, paginação, ordem de carga |
| [`../endpoints.md`](../endpoints.md) | Referência rota a rota |
| [`../swagger.md`](../swagger.md) | Padrão obrigatório ao criar endpoint novo |
| [`../testes-swagger.json`](../testes-swagger.json) | Payloads de teste na ordem de carga |
| [`../../planos/compras-notas-entrada.md`](../../planos/compras-notas-entrada.md) | Fornecedores e notas de entrada **do lado da plataforma** |

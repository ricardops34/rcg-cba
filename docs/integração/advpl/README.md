# Integração Protheus → API BJ (Plataforma Comercial)

> **Remoção em 08/09/2026:** as rotinas que consultavam diretamente SX2, SXE
> e SX6 foram retiradas, inclusive do legado. O motivo é a proibição do projeto
> de acessar dicionários diretamente em AdvPL: consultas e operações devem
> usar APIs do framework; cadastro e conferência ficam no Configurador.
> A lista de rotinas removidas e os impactos estão no
> [registro da remoção no plano](PLANO.md#remoção-dos-acessos-diretos-ao-dicionário--08092026).
> `BJPLA006` prepara as colunas `S_T_A_M_P_`, sem validar SZZ ou parâmetros.

> **Plano de execução dos ajustes:** [BJPLA001 a BJPLA006](../../plan/refactor-bjpla-legibilidade-1.md).
> Roteiro subordinado ao plano principal, com tarefas, dependências e critérios de aceite. Estado: planejado.

> **Padrão de escrita dos fontes BJ — vigente desde 08/09/2026:** AdvPL
> legível para quem mantém Protheus, com fluxo explícito, nomes pela finalidade,
> mapeamentos visíveis e uso direto das funções nativas. Funções auxiliares
> devem representar operações reais, sem reinventar o AdvPL.
> **Proibição estrita de wrappers customizados:** É terminantemente proibido criar funções wrappers para operações nativas do AdvPL (arquivos, strings, arrays, condicionais ou conversões básicas). Operações como criação/remoção de arquivos (`File()`, `MemoWrite()`, `FErase()`, `MakeDir()`), manipulação de strings e preenchimento de objetos devem ser feitas diretamente no ponto de origem com funções padrão AdvPL.
> As referências são IMPPED.prw, SINCMAX.prw e FuncXMaxima.prw.
> Consulte as [diretrizes obrigatórias e critérios de revisão](PLANO.md#diretriz-de-legibilidade-proibição-estrita-de-funções-wrapper--08092026).
> A adequação dos fontes BJ a esse padrão ainda está pendente.

> ## ⚠️ DOCUMENTO HISTÓRICO — NÃO SIGA
>
> **Este README descreve os onze fontes `BJIN*`, que foram substituídos pelos
> seis `BJPLA*` e movidos para [`Remover/`](Remover/) em 08/09/2026.** Os links
> para `BJIN001.prw`, `BJIN002.prw` e os demais estão quebrados de propósito: os
> arquivos não estão mais aqui.
>
> Nada nele vale como instrução — em especial a seção **Instalação**, que manda
> compilar os onze fontes, rodar `U_BJIN999()` e agendar a rotina `BJIN900`.
> Seguir esses passos coloca no RPO uma integração aposentada, que disputaria o
> mesmo balde de 60 req/min e as mesmas chaves na plataforma que a estrutura
> nova. O parâmetro `MV_BJAPI04` que ele exige também não existe mais: a marca
> d'água mora na SZZ.
>
> **➡️ O documento vigente é o [`PLANO.md`](PLANO.md)**, que cobre a integração
> inteira: os dois lados, o que já foi entregue e o que falta.
>
> Fica no lugar até a `TASK-053` reescrevê-lo. Guarda o desenho da estrutura
> anterior, que é de onde saiu boa parte das decisões que o `PLANO.md` herdou.

Integração AdvPL entre o Protheus e a API pública de integração da plataforma BJ
(`/api/v1/integracao/...`), documentada em `C:\VPS\rcg\docs\integração`.

Substitui, para a plataforma nova, o caminho do portal antigo
([`Portal/OnLine/OnLine.prw`](../OnLine/OnLine.prw) e [`rest/portal_erp.prw`](../../rest/portal_erp.prw)),
que postava lotes (`{"conteudo":[...]}`) lendo views `Online.dbo.*`. A API BJ é
REST por recurso — **um registro por chamada** —, então o desenho aqui é outro.

**Não cria tabela no dicionário.** O estado da integração mora em um parâmetro,
na coluna `S_T_A_M_P_` das próprias tabelas de origem, em arquivos no disco do
servidor e na fila da plataforma — o mesmo desenho que o `OnLine.prw`, o
[`SINCMAX.prw`](../../Faturamento/Maxima/SINCMAX.prw) e o
[`IMPPED.prw`](../../Faturamento/Maxima/IMPPED.prw) já usam nesta base.

---

## Fontes

A numeração segue a convenção do Protheus (prefixo de 4 + número de 3), mas as
centenas significam o sentido do fluxo — dá para saber o que um fonte faz antes
de abri-lo:

| Faixa | O que mora nela |
|---|---|
| `0xx` | Infraestrutura — não conhece nenhuma entidade de negócio |
| `1xx` | **ERP → plataforma**: o que sai daqui |
| `2xx` | **Plataforma → ERP**: o que chega |
| `8xx` | Telas |
| `9xx` | Job e preparação do ambiente |

| Fonte | O que faz |
|---|---|
| [`BJIN001.prw`](BJIN001.prw) | Cliente HTTP: URL, `x-api-key`, timeout, retentativa, tradução do erro. Utilitários de conversão (data ISO, texto nulo, flag ativo) |
| [`BJIN002.prw`](BJIN002.prw) | Motor: catálogo das entidades na ordem de carga, varredura, decisão POST/PATCH/DELETE |
| [`BJIN003.prw`](BJIN003.prw) | Apoio: semáforo em arquivo, log em disco, marca d'água e montagem do filtro de `S_T_A_M_P_` |
| [`BJIN110.prw`](BJIN110.prw) | Mapeadores de cadastro: regras de desconto, categorias, condições, armazéns, produtos, vendedores, clientes, tabelas de preço, estoque |
| [`BJIN120.prw`](BJIN120.prw) | Mapeadores transacionais: objetivos, notas de saída (+ XML da NF-e via TSS), títulos a receber, orçamentos |
| [`BJIN130.prw`](BJIN130.prw) | Legado: não participa mais do ciclo; exclusões são decididas nos mapeadores |
| [`BJIN210.prw`](BJIN210.prw) | Orçamentos criados na plataforma viram Pedido de Venda (MATA410 por ExecAuto) |
| [`BJIN220.prw`](BJIN220.prw) | Alterações de cliente aprovadas na plataforma voltam para a SA1 |
| [`BJIN800.prw`](BJIN800.prw) | Monitor: pendências por entidade, log de erros, envio manual, marca d'água |
| [`BJIN900.prw`](BJIN900.prw) | Ciclo agendado: envios (POST/DELETE) → XML → retornos |
| [`BJIN999.prw`](BJIN999.prw) | Cria as pastas e a coluna `S_T_A_M_P_`; conferência de parâmetros removida — realizar pelo Configurador |

As funções acompanham o fonte: `U_BJI110E` é o mapeador de produtos, em
`BJIN110`; `U_BJI210G` gera o pedido, em `BJIN210`.

O DELETE percorre os mesmos mapeadores `1xx` do POST. `D_E_L_E_T_` decide o
verbo depois que `S_T_A_M_P_` seleciona a alteração.

---

## Instalação

1. Compile os onze fontes.
2. **Cadastre os parâmetros** `MV_BJAPI01` a `MV_BJAPI04` — no Configurador, ou
   distribuídos por UPDDISTR. A tabela abaixo é a especificação. Nada no código
   grava no SX6.
3. Rode `U_BJIN999()` em **ambiente exclusivo**. Ele cria as pastas de trabalho e
   a coluna `S_T_A_M_P_` nas tabelas lidas pela integração. A conferência dos parâmetros
   foi removida e deve ser feita pelo Configurador. As tabelas são abertas em modo exclusivo — com usuário
   conectado, a criação falha naquela tabela e a rotina informa quais ficaram de
   fora.
4. Preencha `MV_BJAPI02` com a chave de API (`itg_...`), obtida em
   *Administração > Integração* na plataforma. A chave carrega a empresa — uma
   chave por empresa do Protheus.
5. Ligue `MV_BJAPI03` = `S`.
6. Cadastre a rotina do monitor no menu, apontando para `U_BJIN800`.
7. Cadastre o agendamento em *Configurador > Ambiente > Schedule > Agendamentos*,
   apontando para a rotina `BJIN900`. Empresa e filial saem da própria tela do
   agendamento. **Uma chave de API por empresa, logo um agendamento por empresa.**

**Todos os parâmetros são lidos com valor padrão**, então a integração sobe antes
do SX6 estar completo — com uma exceção: `MV_BJAPI04` **precisa existir**.
`PutMV` altera parâmetro existente e não cria; sem ele a marca d'água nunca
avança e a varredura repete a mesma janela em todo ciclo. O código detecta e
avisa no log, mas não tem como se corrigir sozinho.

**Primeira carga:** com `MV_BJAPI04` vazio, a marca d'água recua 30
dias e a primeira varredura sobe tudo que mudou nesse período. Para carregar a
base inteira, abra o monitor, use *Marca* para recuar a data o quanto for
necessário e acompanhe — respeitando a ordem de carga do catálogo, que a API
exige (não aceita referência a registro inexistente).

**Campo opcional.** Crie `C5_XBJORC` (caractere, 36) na SC5 se quiser que o
Pedido de Venda gerado guarde o id do orçamento que o originou. Sem ele a
integração funciona, mas perde o rastro de volta — dado um pedido, saber de qual
orçamento veio.

---

## Parâmetros

Quatro, e só. O resto do que costuma virar parâmetro nesse tipo de integração é
constante no fonte: timeout, número de tentativas, pausas entre requisições,
prazo do semáforo e pasta de trabalho não mudam por ambiente, e as pausas em
particular derivam do teto da API — baixá-las só rende `429`.

| Parâmetro | Tipo | Padrão | Para quê |
|---|---|---|---|
| `MV_BJAPI01` | C | `https://api.rcgcba.bjsoft.com.br/api/v1` | URL base, já com o prefixo das rotas |
| `MV_BJAPI02` | C | — | Chave de API (`x-api-key`). Uma por empresa |
| `MV_BJAPI03` | C | `N` | Habilita a integração |
| `MV_BJAPI04` | C | — | **Marca d'água UTC** do último ciclo concluído |

Os três primeiros são lidos com valor padrão, então a integração sobe antes de
existirem. `MV_BJAPI04` é diferente: ele é **gravado**, e `PutMV` não cria
parâmetro. Sem ele cadastrado, a marca nunca avança e a varredura repete a mesma
janela em todo ciclo — o código detecta e grita no log, mas não se corrige sozinho.

### O que deixou de ser parâmetro

| Era | Virou | Por quê |
|---|---|---|
| Timeout, tentativas, espera de retentativa | Constantes em `BJIN001` | Nunca precisaram de ajuste em campo |
| Pausas entre requisições | `BJ_PAUSA_REQ` e `BJ_PAUSA_XML` | Derivam do teto da API; reduzir não acelera |
| Prefixo das rotas | Parte da URL base | Prefixo e host mudam juntos |
| Prazo do semáforo, pasta de trabalho | Constantes em `BJIN003` | São da instalação, não da operação |
| Dias retroativos da primeira carga | `BJ_DIAS_INICIAL` | Ponto de partida; histórico se puxa pela tela |
| TES e armazém do pedido gerado | — | O `MATA410` resolve pelos gatilhos e pela TES inteligente. Um valor fixo erraria em toda venda fora do caso comum |
| Conta bancária da cobrança | Campos da SE1 | `E1_PORTADO`, `E1_AGEDEP` e `E1_CONTA` já estão no título, como o `BjBoletos` usa |
| Campos da SA1 bloqueados | O de-para em `BJDeParaCli` | A lista de campos que voltam já é a lista branca |
| Alias da tabela de objetivos | — | Um alias sozinho não escreve a query; quem implementar mexe no mapeador |
| Gera pedido automaticamente | Modo do agendamento | Orçamento lido e não transformado fica pendente para sempre. Quem quer só envios agenda o modo `E` |
| Log de sucesso, limite de XML por ciclo | — | Erro sempre grava; sucesso fica no console |

---

## Onde mora o estado

Nenhuma tabela nova. Cada coisa que precisa ser lembrada tem um lugar próprio:

| O que | Onde | Fonte |
|---|---|---|
| O que já foi enviado | `S_T_A_M_P_` das tabelas de origem, comparado com `MV_BJAPI04` | `BJIN003` |
| Um processo por vez | Arquivo `.tsk` em `\bjapi\<empresa>\` | `BJIN003` |
| O que deu errado | `\bjapi\<empresa>\log\erro-*.txt`, com payload e resposta | `BJIN003` |
| Resultado de cada ciclo | `\bjapi\<empresa>\ciclo\` e o console do AppServer | `BJIN003` |
| Retorno já tratado | Fila da própria plataforma + `C5_XBJORC` na SC5 | `BJIN210`, `BJIN220` |

### A marca d'água

`MV_BJAPI04` guarda a hora do último ciclo que terminou **sem erro nenhum**.
Cada varredura envia o que estiver acima dela. Três regras seguram o desenho:

**A hora é lida antes do ciclo, não depois.** Marcar a hora do fim descartaria em
silêncio tudo que fosse alterado durante a varredura. Lendo antes, o pior caso é
reenviar no ciclo seguinte algo que já subiu — uma requisição a mais. O outro
caminho perde o registro sem deixar rastro.

**A hora vem do banco, não do AppServer.** O `S_T_A_M_P_` é escrito pelo gatilho
do DBAccess em **UTC**. Uma marca tirada de `Date()`/`Time()` ficaria três horas
adiantada no horário de Brasília, e tudo que mudasse nesse intervalo sairia da
varredura.

**A marca só anda no ciclo completo e sem erro.** Envio pela tela é ação dirigida
e não a move; modo parcial (`E`, `X`, `D`, `R`) também não, porque envios e
exclusões leem a mesma marca e só andam juntos.

### A coluna `S_T_A_M_P_`

Mantida pelo DBAccess (20.1.1.0 ou superior) por gatilho, a cada inclusão ou
alteração. Não aparece na estrutura AdvPL da tabela — só em query.

`U_BJI999S()` cria a coluna nas tabelas da integração, na sequência que a TOTVS
documenta: `TCConfig('SETUSEROWSTAMP = ON')`, `TCConfig('SETAUTOSTAMP = ON')`,
abrir a tabela **exclusiva**, `TCRefresh()`, desligar os dois. Desligar no fim
não é detalhe: deixado ligado, toda tabela aberta pela thread dali em diante
ganharia a coluna.

Se a coluna faltar, `BJIN003` degrada para o campo de data do cabeçalho
(`F2_EMISSAO`, `E1_EMISSAO`, `CJ_EMISSAO`) e avisa no log. Cadastro sem
`S_T_A_M_P_` e sem campo de data é lido inteiro a cada ciclo — o monitor mostra
esse caso como `TABELA TODA`.

**Item não toca no cabeçalho.** Alterar um `SD2` não atualiza o `S_T_A_M_P_` da
`SF2`. Nas entidades que sobem cabeçalho e itens no mesmo payload — notas
(SF2+SD2), tabelas de preço (DA0+DA1), orçamentos (SCJ+SCK) — o filtro é
`cabeçalho mudou OR existe item que mudou`.

O item continua dentro do payload do cabeçalho. Quando `D_E_L_E_T_` estiver
preenchido em `DA1`, `SD2`, `SCK` ou numa faixa `SZ0`, o item leva
`delete: true`; a API remove
somente esse `codigoErp`. Itens ativos levam `delete: false` e são incluídos ou
atualizados.

---

## Decisões de desenho

### PATCH não usa FWRest

`FWRest` implementa GET, POST, PUT e DELETE — **não implementa PATCH**. A API BJ
exige PATCH em toda atualização parcial, no saldo de estoque e no vínculo de
orçamento. Por isso `BJIN001` usa `HTTPQuote()` só para PATCH, e `FWRest` para o
resto, atrás da mesma assinatura de função.

### POST como upsert e DELETE no mesmo fluxo

O mapeador seleciona alterações por `S_T_A_M_P_` sem filtrar `D_E_L_E_T_`.
Registro ativo gera `POST` (upsert); registro excluído gera `DELETE` com a mesma
chave. Não existe varredura independente de exclusões.

### Cliente: PATCH não grava

`PATCH /integracao/clientes/{codigo}` **não altera o cadastro** — a mudança entra
na fila de aprovação interna da plataforma. O motor lê `pendente` na resposta e
registra isso no log, para não parecer que a alteração foi aplicada.

### Chave do cliente

A API tem uma chave só; o Protheus tem `A1_COD` + `A1_LOJA`. O `codigoErp`
enviado é a concatenação dos dois — mesmo critério do portal antigo, e cabe nos
30 caracteres do contrato.

### codigoErp dos transacionais

É a composição dos campos naturais da tabela, incluindo `*_FILIAL`.
`R_E_C_N_O_` não participa da integração.

### Pedido gerado do orçamento

O `BJIN210` segue o [`IMPPED.prw`](../../Faturamento/Maxima/IMPPED.prw), que já é
o caminho conhecido desta base para importar pedido por `MATA410`:

- O cabeçalho puxa do **cadastro do cliente** o que o orçamento não informa —
  natureza, condição, tabela de preço, forma de pagamento e vendedor.
- O **TES vem do `B1_TS`** do produto. Sem `B1_TS`, o `C6_TES` não é enviado e a
  TES inteligente do ambiente resolve.
- **A numeração é do `MATA410`.** Nada de `GetSxeNum` antes; o número sai da SC5
  posicionada depois. Na recusa, `RollBackSx8` roda em laço e devolve todos os
  semáforos consumidos.
- Campos de rastro (`C5_ORGPED`, `C5_DTIMP`, `C5_HRIMP`, `C5_INDPRES`,
  `C5_XOBSVEN`) só entram quando existem no dicionário.

> **Cliente bloqueado é liberado.** Como no `IMPPED`, `A1_MSBLQL` passa de `1`
> para `2` e o pedido segue — gravado pelo cadastro MVC de clientes (`CRMA980`,
> que substituiu o `MATA030`), não por `RecLock`. A liberação é
> **permanente**: o bloqueio não volta depois. Um cliente bloqueado por crédito
> que faça um orçamento na plataforma sai desta rotina liberado. Cada liberação grava um arquivo
> `bloqueio-*.txt` na pasta de log, com cliente, orçamento, data, hora e usuário,
> além do aviso no console.

### Idempotência dos retornos

Quem garante que um orçamento não vire dois pedidos é a **fila da plataforma**:
`/orcamentos/pendentes` só devolve o que ainda não tem `codigoLegado`, e o PATCH
de vínculo o tira da lista. Mesmo desenho do `IMPPED.prw` com o `StatusPedidos`
da Máxima.

A consulta a `C5_XBJORC` cobre a fresta entre gerar o pedido e o PATCH dar certo:
se a rede cair nesse intervalo, o orçamento volta na próxima leitura e o pedido
já existe. Vale o mesmo para `BJIN220`, com o `PATCH .../aplicada`.

### Exclusões

Cada mapeador lê `D_E_L_E_T_` sem usá-lo como filtro. Valor em branco gera POST
(upsert); `*` gera DELETE com a mesma `codigoErp`. `BJIN130` não participa mais
do ciclo.

Não há registro do que já foi enviado antes, então um `DELETE` pode chegar para
uma chave que a plataforma nunca conheceu. A API responde **404** e o evento
conta como resolvido: o objetivo era que o registro não estivesse lá, e não está.

Tabela sem `S_T_A_M_P_` não participa da varredura incremental.

---

## Limite de requisições — leia antes da primeira carga

A API limita **60 req/min nas rotas de integração** e **120 req/min no envio de
XML**, contados **por IP de origem, não por chave**. Com um registro por chamada,
isso é o fator que dita a duração da carga:

| Volume | Tempo aproximado |
|---|---|
| 1.000 registros | ~17 min |
| 5.000 registros | ~1h25 |
| 20.000 registros | ~5h40 |

`BJ_PAUSA_REQ` (1050 ms) mantém o ritmo logo abaixo do teto. Reduzir esse valor não
acelera a carga: passa a render 429, retentativa e espera progressiva — mais
lento no total.

Consequências práticas:

- A **carga inicial** deve ser planejada como uma janela longa, fora do horário
  comercial, entidade por entidade.
- O **regime permanente** é confortável: só o que mudou vira requisição.
- Se dois processos do Protheus (ou o portal antigo) saírem pelo mesmo IP,
  dividem o mesmo balde.

---

## Cobertura das entidades

| Entidade | Origem no ERP | Situação |
|---|---|---|
| regras-desconto | SZ0 (`Z0_SEQ = "001"`) | ✅ mapeada |
| categorias | SBM | ⚠️ mapeada sem hierarquia — ver abaixo |
| condicoes-pagamento | SE4 | ✅ mapeada |
| armazens | NNR | ✅ mapeada |
| produtos | SB1 | ⚠️ mapeada sem marca/subcategoria/regra — ver abaixo |
| vendedores | SA3 | ✅ mapeada |
| clientes | SA1 | ✅ mapeada (PATCH vai para aprovação) |
| tabelas-preco | DA0 + DA1 | ✅ mapeada com itens |
| estoque | SB2 (`B2_QATU - B2_RESERVA`) | ✅ mapeada |
| objetivos | — | ❌ **sem origem definida** — ver abaixo |
| notas-saida | SF2 + SD2 | ✅ mapeada com itens |
| notas-saida/xml | TSS (`WSNFeSBRA`) | ✅ implementada, guiada por `semXml=true` |
| titulos-receber | SE1 | ✅ mapeada, com cobrança bancária |
| orcamentos | SCJ + SCK | ⚠️ mapeada, inativa no catálogo — ver abaixo |
| orcamentos/pendentes | plataforma → Pedido de Venda | ✅ implementado |
| clientes-alteracoes | plataforma → SA1 | ⚠️ implementado, rota ainda não existe na API |

### Pontos que dependem de decisão do ambiente

Estes ficaram explícitos no código em vez de adivinhados. Todos estão isolados e
prontos para ligar:

1. **Hierarquia de categorias.** A SBM não tem categoria pai nativa.
   [`BJIN110.prw`](BJIN110.prw) procura um campo customizado `BM_XCATPAI`; se ele
   não existir no dicionário, todas as categorias sobem como raiz e
   `subCategoriaCodigo` do produto vai nulo. Para ativar: crie o campo, ou troque
   o nome na constante `cCpoPai` do mapeador `BJI110B`.

2. **Regra de desconto no produto e no item de tabela de preço.** O contrato
   aceita `regraDescontoCodigo`, mas não identifiquei o campo correspondente na
   SB1/DA1 deste dicionário — está indo `null`. Se existir campo customizado,
   indique qual e eu ligo os dois pontos.

3. **Marca do produto.** Idem: `marca` não está sendo enviado. Candidatos que
   apareceram no repositório (`B1_XFOR`, `B1_TPRCG`) têm outra semântica aparente
   — não quis assumir.

4. **Objetivos de venda.** O Protheus padrão não tem tabela de meta por
   vendedor/mês. A entidade está **inativa no catálogo** e o mapeador `BJI120A`
   devolve vazio. Quando a origem existir, a leitura entra no próprio mapeador,
   em cima do contrato
   `{ codigoLegado, vendedorCodigo, mes, ano, valor, categorias[] }`.

5. **Orçamentos do ERP (SCJ/SCK).** Mapeados, mas **inativos no catálogo**
   (`BJIN002C`, coluna `lAtivo`), porque o de-para de `CJ_STATUS` para o
   vocabulário da API (`rascunho`/`enviado`/`aprovado`/`recusado`/`expirado`) foi
   uma suposição — a função `BJStatOrc` concentra essa tradução. Confirme os
   valores usados na sua base e ligue a entidade.

6. **Retorno de alteração de cliente.** As rotas que o `BJIN220` consome ainda
   **não existem** na API de integração. O que existe hoje é
   `GET /clientes-alteracoes`, sob JWT e permissão `clientes.aprovar`, declarada
   como rota interna. Enquanto a rota não subir, o fonte registra o 404 e não faz
   nada — não quebra o ciclo. A rota está em `BJ_ROTA_ALTCLI`, no topo do fonte.

7. **Purge de registros.** Removida a linha fisicamente do banco (reccar,
   reindexação com purge), ela não aparece nem na varredura de envio nem na de
   exclusão. Nesse caso a exclusão precisa ser disparada pelo botão *Retorno* do
   monitor.

---

## Monitor (`U_BJIN800`)

Quadro de situação por entidade: a marca d'água em vigor, quantos registros estão
acima dela, e como cada tabela está sendo filtrada (`S_T_A_M_P_`, `por data` ou
`TABELA TODA`).

| Botão | O que faz |
|---|---|
| **Atualizar** | Refaz a contagem |
| **Enviar** | Envia uma entidade, ou uma chave só. Não move a marca d'água |
| **Ciclo** | Roda o ciclo completo agora. Terminando sem erro, a marca avança |
| **Retorno** | Trata um retorno pelo id: gera o pedido, reaplica o cliente, ou envia uma exclusão |
| **Erros** | Lista os `erro-*.txt` e abre o escolhido, com payload e resposta |
| **Marca** | Altera a marca d'água — recuar reprocessa um período |
| **Ajuda** | Explica como a integração decide o que enviar |

A contagem é uma estimativa por cima: conta linhas alteradas desde a marca, mas o
envio real ainda descarta o que o mapeador filtrar. Serve para responder "há
muito ou pouco para subir".

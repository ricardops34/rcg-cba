# Plano: prioridade no envio — lotes fracionados

> **Status (26/09/2026): escrito, falta compilar e testar.** Dicionário criado
> pelo usuário (`ZY_PRIOR`, índices 3 da SZY e da SZZ, `MV_BJAPI12`); SZY e
> SZZ limpas para um teste completo. Código: pesos no catálogo
> (`U_BJCATALO`, colunas 8 e 9) e `U_BJABRELT` (BJPLA002); coleta fracionada
> (`U_BJVARRE`, `BJVarreEnt`, `BJFechaCol` — BJPLA003); envio por prioridade,
> erro de dado sem travar e mensagem superada (`U_BJDRENA`, `BJFechaEnv`,
> `BJSuperada` — BJPLA004); retorno com lote por página (`U_BJRETORNO`,
> `BJLeOrcam`, `BJFechaRet` — BJPLA004); monitor (BJPLA005). Critério: [Prioridade dos dados](../integracao/advpl/README.md#prioridade-dos-dados).
>
> Substitui a primeira versão deste plano (três filas com agendamentos
> próprios): o usuário propôs uma fila só, com lotes pequenos e a prioridade
> conferida a cada lote — mais simples e cobre o mesmo problema.

## O problema

Uma carga inicial de ~104 mil títulos (lote `000003`) parou a integração: o
envio (`U_BJDRENA`) anda lote a lote e só olha o próximo lote quando termina o
atual — ~30 h. Estoque, preço e clientes dos lotes novos esperam.

## Desenho

### 1. Na coleta: lotes por classe e com tamanho máximo

**`ZY_PRIOR` é a prioridade de processamento do lote** (decisão do usuário,
26/09) — um peso numérico, maior sai primeiro. Não é a origem nem a
frequência da coleta: é o que o lote contém que decide.

**Um lote tem uma única entidade** (decisão do usuário, 26/09): `U_BJVARRE`
abre um lote novo a cada entidade e também quando o lote chega a
**`MV_BJAPI12`** mensagens. A coleta anda **pela prioridade**: classe do maior
peso para o menor, e dentro dela a ordem do catálogo.

| Classe | Entidades | Peso — dia a dia | Peso — carga |
|---|---|---|---|
| Cadastros base | `regras-desconto`, `categorias`, `condicoes-pagto`, `armazens`, `vendedores`, `fornecedores`, `produtos` | **95** | 55 |
| Críticos | `estoque`, `tabelas-preco`, `clientes`, `titulos-receber` | **90** | 50 |
| Histórico | `notas-saida`, `notas-saida-xml`, `notas-entrada` | **40** | 10 |

Duas regras fixam os números:

1. **Cadastro base acima de crítico.** Cliente aponta para vendedor e tabela;
   título, para cliente e vendedor. Se o dependente sai antes, a API recusa.
   Cadastro base é volume pequeno — ir na frente quase não atrasa nada.
   `fornecedores` vai com os cadastros base: o produto aponta para o fabricante
   (`fabricanteChave`), e a API grava o produto sem fabricante se ele ainda não
   chegou — silenciosamente. Os pesos moram no catálogo (`U_BJCATALO`, colunas 8 e 9).
2. **Carga abaixo do dia a dia da mesma classe**, preservando entre as classes
   a ordem de dependência (55 > 50 > 10). Sem isso, a carga de 104 mil títulos
   teria o peso do título baixado hoje e, por ser o lote mais velho, sairia
   antes — o problema de 25/09 de volta.

"Carga" é a coleta sem marca (carga inicial), com período (Gerar com datas) ou
recoleta em massa pelo monitor; "dia a dia" é a coleta agendada pela marca.

**A marca d'água só vai no último lote da coleta**, e só se a coleta inteira
passou sem erro e foi completa (regra de 25/09). Os lotes intermediários ficam
sem marca — a leitura da marca já pega o lote mais recente **com** marca.

### 2. No envio: conferir a prioridade a cada lote

O envio pega **o lote aberto de maior prioridade** (`ZY_PRIOR` **maior**), e dentro
dela o mais antigo. Terminou o lote, volta a perguntar — se chegou um lote mais pesado
enquanto ele enviava carga, é esse que sai agora.

Para os lotes que já nasceram grandes (o `000003`) ou que escapem do teto, o
envio também **confere a cada `MV_BJAPI12` mensagens dentro do lote**: se há
lote de prioridade maior, para ali — o que faltou continua pendente e o lote
volta na vez dele.

### 2b. Gerar, enviar e receber são independentes (26/09, teste da carga)

No teste, a carga gerou os lotes 55 e 50 e o envio **não rodou nenhuma vez**:
o Schedule tem um agente, e com a coleta ocupando-o a execução do
`U_BJDRENA` ficava "Aguardando execução" até ser cancelada pela seguinte.

Decisão do usuário: **gerar, enviar e receber são processos independentes —
"ficou pronto, pode fazer"**. Então:

- **Pronto = fechado pela coleta.** O envio só pega lote com `ZY_DTFIM`
  preenchido; o lote ainda em geração não é tocado.
- **A coleta libera e segue** (`BJLibera`, BJPLA003): ao fechar cada lote
  (por tamanho, por troca de classe e o último), dispara o envio e o retorno
  em threads próprias (`StartJob`, com `{empresa, filial}` como o Schedule) e
  **não espera** nenhum dos dois.
- Cada processo pega a própria trava. Envio já rodando → a thread nova acha
  a `BJPLA_ENVIO` ocupada e termina; o envio em andamento pega o lote
  recém-liberado na próxima volta, pela prioridade. O mesmo com o retorno.
- O **Reenviar** do monitor só recoleta; o envio corre em segundo plano.
- O `U_BJRETORNO` passou a usar o `{empresa, filial}` do primeiro parâmetro
  (antes abria sempre em 01/01).

Uma primeira versão fazia a coleta **pausar** e enviar na própria thread —
descartada: acoplava os processos e a coleta esperava o envio.

**Mais agentes no Schedule continua recomendado**: o disparo só acontece
quando a coleta fecha um lote; fora da coleta, envio e retorno dependem do
agendamento deles.

### 2c. Reenvio só de lote com erro (26/09)

Decisão do usuário: **reenvio é de lote com erro de processamento** — o Job, a cada execução, começa pelos erros e depois vai aos não enviados; o monitor tem o Reenviar manual, só para lote com erro.

| Situação | O que acontece |
|---|---|
| Mensagem pendente (`1`) | Sai sozinha, pelo envio automático e pela prioridade |
| Erro de **dado** (400, 404, 409, 422) | Vira `3` e o envio **passa para a próxima** mensagem e o próximo lote. **A execução seguinte do Job começa por ele**: fase 1 = lotes com erro (cada mensagem uma vez por execução), fase 2 = não enviados (decisão do usuário, 26/09) |
| Falha de **API ou rede** (transporte, 5xx, 401, 403, 429) | **Não é erro de processamento**: a mensagem continua `1`, com a falha anotada em `ZZ_RETORN`, e o próximo envio tenta de novo. Marcar `3` encheria os lotes de erro a cada queda da API |
| Lote vermelho (`3`) | **Reenviar** no monitor (era "Enviar"): recusa lote que não é `3`; relê as mensagens com erro do lote e manda o mesmo payload — o dado tem que ser corrigido na origem antes. Se o erro foi na coleta (nenhuma mensagem falhou no envio), orienta a gerar de novo |

**A mesma regra na coleta e no retorno** — erro passa para o próximo, e a
execução seguinte começa pelos erros:

- **Coleta:** os **pesos das classes (lotes)** que tiveram erro vão para o
  `MV_BJAPI15` (gravado no fim da coleta do catálogo inteiro); a coleta
  seguinte começa por essas classes e depois segue pela prioridade. A janela
  já era relida (marca não avança com erro); agora a ordem começa por elas.
  (Uma primeira versão guardava as entidades — o usuário corrigiu: é por
  lote/prioridade.)
- **Retorno:** antes da lista normal, uma rodada só com os orçamentos cuja
  mensagem de entrada ficou com erro e não foi aplicada depois
  (`BJOrcErro`).

Saíram os botões **Reenviar entidade** e **Reenviar esta chave** da tela de
mensagens (recoletavam da origem). Recoleta pontual continua pelo **Gerar**,
Individual, com a chave.

### 3. Mensagem superada não sai

Ao enviar um lote de **carga**, a mensagem cuja entidade + chave já tem
mensagem **mais nova** (lote de código maior) executada ou pendente é marcada
executada ("superada pelo lote X"), sem enviar.

Sem isso, a carga — enviada depois — sobrescreveria na plataforma o que o dia
a dia já mandou: um título baixado ontem voltaria em aberto.

### 4. O resto que já estava decidido

- **Erro de dado marca a mensagem e segue**; só erro de API/rede para o envio.
- **Envio em bloco (`PUT`)**, `MV_BJAPI09` por requisição; o XML da nota
  (rota com `{chave}`) continua individual. Poucas requisições por minuto:
  a folga do limite da API (60/min por IP) fica para o **ciclo do orçamento**,
  que é crítico e roda à parte (`U_BJRETORNO`).
- **O lote fecha quando não sobra pendente**, qualquer que seja a rotina que
  enviou (hoje o Enviar em Bloco nunca fecha).
- Uma trava só (`BJPLA_ENVIO`), um agendamento só.

### 5. A mesma regra no retorno (plataforma → ERP)

Pedido do usuário: fracionar e conferir a prioridade também no retorno
(`U_BJRETORNO`). Hoje ele abre **um lote por execução** e lê **todos** os
orçamentos pendentes (páginas de 100) antes de passar às alterações de
cliente.

| Hoje | Com a regra |
|---|---|
| Um lote para a execução inteira | **Um lote por página** de orçamentos (100) e um para as alterações de cliente |
| Orçamentos, depois alterações, e termina | Orçamentos → alterações → **volta a perguntar por orçamentos novos** antes de terminar; repete enquanto houver, até um teto por execução |
| Um orçamento que chega durante uma leva grande de alterações espera a próxima execução | Sai no mesmo ciclo |

Prioridade dentro do retorno:

| Ordem | O quê | Por quê |
|---|---|---|
| 1 | Orçamentos aprovados → pedido + vínculo à plataforma | Venda; o vendedor espera o número do pedido |
| 2 | Alterações de cliente aprovadas | Cadastro; pode esperar minutos |

O retorno **continua fora da fila de envio** — trava e agendamento próprios.
Envio e retorno não se esperam; o que dividem é o limite da API, e por isso
o envio passa a ser em bloco (seção 4). Cada orçamento já é tratado e
confirmado sozinho (idempotente, ver *Idempotência dos retornos* no README),
então fracionar o lote não muda o que acontece com ele — muda o que o monitor
mostra e quanto um lote pode demorar.

## Dicionário (Configurador — decisão do usuário)

| Item | Para quê |
|---|---|
| Campo `ZY_PRIOR` **N(2)** na SZY — prioridade de processamento, peso numérico: maior sai primeiro (tabela da seção 1) | Seção 1 |
| Índice 3 na SZY: `ZY_FILIAL + ZY_STATUS + STR(ZY_PRIOR,2) + ZY_CODIGO` (campo numérico entra na chave por `STR`) | O próximo lote sai de consulta SQL (`ORDER BY ZY_PRIOR DESC, ZY_CODIGO`); o índice é o que a responde sem varrer |
| Índice na SZZ: `ZZ_FILIAL + ZZ_TIPO + ZZ_ENTID + ZZ_CHVORI` | Seção 3 — achar a mensagem mais nova da mesma chave |
| Parâmetro `MV_BJAPI12` N | Tamanho máximo do lote. **Reaproveitado** (decisão do usuário, 26/09): estava sem uso desde 21/09, quando guardava o caminho das travas `.tsk` como caractere — se ainda estiver cadastrado, trocar o tipo para N |

## Decisões em aberto

1. **Tamanho do lote (`MV_BJAPI12`).** Sugestão: **2.000**. O critério é o
   tempo que um lote de carga pode segurar o dia a dia; com envio em bloco,
   minutos. Ajustar depois da medição do Enviar em Bloco.
2. Criar o campo, os dois índices e o parâmetro acima.
3. Lotes existentes (misturam classes — são anteriores à regra): `000002` a `000009` como carga de crítico (`50`); `000010` em diante
   como dia a dia de crítico (`90`). A superação (seção 3) cobre o que houver de mais novo em outro lote.

## Enquanto não sai

Destravar pelo **Enviar em Bloco** do monitor, com o agendamento do
`U_BJDRENA` desativado.

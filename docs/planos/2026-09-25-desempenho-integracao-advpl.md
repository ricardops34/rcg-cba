# Plano: desempenho da integração AdvPL (coleta e envio)

> **Status (25/09/2026): duas mudanças aplicadas.** O que ficou de fora está em
> [Não feito](#não-feito), com o motivo.
>
> Fontes: [`docs/integracao/advpl/`](../integracao/advpl/) — é a cópia viva.
> A de `docs/integracao/windows/referencia-advpl/` já estava atrás **antes**
> disto (`F2_SERIE IN ('1','3')` e o tratamento de `xEntid` como lista) e
> continua atrás.

## O problema relatado

"Na geração de dados o envio do JSON está muito lento." Depois esclarecido:
**a lentidão está no envio**, não na coleta.

## O que mede o quê

| Etapa | Função | Custo dominante |
|---|---|---|
| Gerar | `U_BJVARRE` → `BJVarreEnt` → `U_BJENFILA` | `SELECT MAX(ZZ_SEQUEN)` por registro, sem índice que o resolva |
| Enviar | `U_BJDRENA` | **`Sleep(MV_BJAPI08)` = 1050 ms por mensagem** |

O envio é limitado por taxa, não por código: a API aceita 60 req/min por IP, e
`MV_BJAPI08` segura o ritmo logo abaixo do teto. Baixar o parâmetro não acelera
— rende 429, retentativa e espera progressiva. Ver
[Limite de requisições](../integracao/advpl/README.md#limite-de-requisições--leia-antes-da-primeira-carga).

## Feito

### 1. Régua a cada N registros, não a cada um

`IncRegua2` repinta a tela e monta três strings a cada chamada. Passou a um
passo de **no mínimo 100 registros**, rendendo **no máximo 100 atualizações**:

```advpl
nPasso  := Max(100, Int(Len(aDados) / 100))
nPassos := Int(Len(aDados) / nPasso)
```

`IncRegua2` anda uma casa por chamada, então a régua é dimensionada em
**passos**, não em registros — senão a barra pararia numa fração do caminho.

- Coleta: `BJVarreEnt`, em [`BJPLA003.prw`](../integracao/advpl/BJPLA003.prw)
- Envio: `U_BJDRENA`, por grupo de entidade, em [`BJPLA004.prw`](../integracao/advpl/BJPLA004.prw)

O teste de `oProcess:lEnd` **continua a cada registro** — é o que faz o botão
Cancelar responder (TASK do commit `7dda99b`).

### 2. Transação em blocos no laço de enfileiramento

Cada `U_BJENFILA` era um `RecLock`/`MsUnlock` solto: um commit por registro,
com gravação de memo (`ZZ_JSON`). Agora entram em blocos de **`MV_BJAPI07`**
(500 por padrão) dentro de um `Begin Transaction`.

**O bloco que falhar volta inteiro.** O lote fecha com erro, é recoletado, e
nada fica meio enviado — o comportamento que já valia para a coleta.

O `Exit` do Cancelar sai **só do laço interno**, ainda dentro da transação, que
fecha logo abaixo gravando o que já entrou. Sair de um `Begin Transaction` por
`Exit`, `Loop` ou `Return` deixa a transação aberta.

### 3. Parâmetro novo

| Parâmetro | Tipo | Padrão | Para quê |
|---|---|---|---|
| `MV_BJAPI07` | N | `500` | Registros por transação ao enfileirar na SZZ |

`07` estava livre — a tabela pulava de `06` para `08`. Cadastrar no
Configurador; sem ele, `SuperGetMV` devolve 500 e o comportamento é o mesmo.

## Não feito

Nenhuma das duas mudanças acima mexe no custo dominante do **envio**. O que
resolveria, em ordem de ganho:

| # | Ação | Ganho estimado | Decisão |
|---|---|---|---|
| 1 | Usar **Enviar em Bloco** (`U_BJLOTE`) na carga: agrupa até `MV_BJAPI09` por `PUT` | ~14 min para 5.000 em vez de ~1h25 — **~6×** | Já existe como botão no monitor. Pendente de uso |
| 2 | Índice novo na SZZ: `ZZ_FILIAL + ZZ_TIPO + ZZ_ENTID + ZZ_CHVORI + ZZ_VERBO` | Tira o table scan de `U_BJTEVE` e `U_BJACHOU` | Pendente — é Configurador, não código |
| 3 | `ZZ_SEQUEN` por lote em vez de global: `MAX` vira seek no índice 1 | Tira N varreduras completas da SZZ na coleta | Pendente — muda semântica descrita no README |
| 4 | `BJMAPRGD`: faixas numa query só, com quebra por `Z0_CODIGO` | Tira o N+1 | Pendente — volume baixo |

**Baixar `MV_BJAPI08` não está na lista de propósito.** O teto é da API, por IP;
reduzir a pausa troca espera previsível por 429 e retentativa.

## Prioridade dos dados (26/09/2026)

Velocidade não é o objetivo em si. O critério foi fixado no README da
integração, em [Prioridade dos dados](../integracao/advpl/README.md#prioridade-dos-dados):
estoque, preço, clientes e **títulos** são críticos; notas e XML são histórico;
orçamento → ERP é o mais sensível. Toda mudança deste plano se mede por ele.

Pendentes que saem dali, **antes** de otimizar tempo:

| # | Mudança | Exigência atendida |
|---|---|---|
| P1 | `U_BJDRENA` busca pendentes de todos os lotes abertos, críticos primeiro | Crítico não espera histórico |
| P2 | Erro de dado marca a mensagem e segue; só erro de API/rede para o lote | Um registro ruim não trava os outros |
| P3 | Conferência periódica de contagens ERP × plataforma por entidade | Divergência aparece |

## Medição do Enviar em Bloco (25/09/2026, noite)

O Enviar em Bloco do lote `000003` (~104 mil mensagens) **levou a noite
inteira**. A estimativa acima (~14 min por 5.000) já dizia isso: ~5 h para
104 mil, ou quase 3 min por `PUT` de 1.000 — tempo que não é a pausa
(`MV_BJAPI08`, 1 s por bloco) nem o limite de requisições (~100 `PUT`s).

Falta saber de que lado ele está, e sem isso otimizar é chute. O `U_BJLOTE`
passou a escrever no console, por bloco (`ConOut` — o `FwLogMsg` não aparece
neste servidor):

```
[BJPLA] Enviar em bloco - notas-saida 1 a 1000 de 5321 - HTTP 200 - montar 2.1s | API 160.4s | gravar 12.3s | 5120 KB
```

- **API** alto → o custo é o processamento do lote na plataforma
  (`processarLote`, registro a registro, com as resoluções de cliente,
  vendedor e produto por item). Otimizar lá.
- **gravar** alto → `U_BJGRAVA` por mensagem (`dbSeek` + `RecLock`). Gravar em
  bloco, numa transação, como já se fez no enfileiramento.
- **montar** alto → `FromJson` + `ToJson` de 1.000 memos.

Próximo passo: rodar um Enviar em Bloco e trazer as linhas `[BJPLA]`.

## Verificação

Não há compilador AdvPL aqui. O que foi conferido:

- Balanceamento de `If`/`EndIf`, `For`/`Next`, `While`/`End` e
  `Begin`/`End Transaction` nas duas funções alteradas, contra a versão de
  `HEAD` — delta neutro nas duas.
- **Falta compilar e rodar uma coleta e um envio de verdade.**
